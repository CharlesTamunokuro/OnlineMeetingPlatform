import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { ENV } from "./_core/env";
import { isEmailConfigured, sendVerificationEmail } from "./email";
import { sdk } from "./_core/sdk";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { createMeeting, getMeetingByMeetingId, getMeetingById, getParticipantsByMeetingId, addParticipant, endMeeting, removeParticipant, updateParticipantAudioStatus, updateParticipantVideoStatus, getUserByEmail, getUserById, createUser, createEmailVerificationCode, getEmailVerificationCode, verifyUserEmail, deleteEmailVerificationCode } from "./db";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { hashPassword, verifyPassword, generateVerificationToken, isValidEmail, validatePasswordStrength, isValidDisplayName } from "./auth-utils";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),

    // Sign up with email and password
    signUp: publicProcedure
      .input(z.object({
        name: z.string().min(2).max(100),
        email: z.string().email(),
        password: z.string().min(8),
      }))
      .mutation(async ({ ctx, input }) => {
        // Validate inputs
        if (!isValidDisplayName(input.name)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid display name",
          });
        }

        if (!isValidEmail(input.email)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid email address",
          });
        }

        const passwordValidation = validatePasswordStrength(input.password);
        if (!passwordValidation.isValid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Password does not meet requirements: ${passwordValidation.errors.join(", ")}`,
          });
        }

        // Check if email already exists
        const existingUser = await getUserByEmail(input.email);
        if (existingUser) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This email already exists",
          });
        }

        if (ENV.emailVerificationRequired && !isEmailConfigured()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Email sending is not configured",
          });
        }

        // Hash password
        const passwordHash = await hashPassword(input.password);
        const verificationToken = generateVerificationToken();

        // Create user
        const user = await createUser({
          openId: nanoid(32),
          name: input.name,
          email: input.email,
          passwordHash,
          emailVerified: !ENV.emailVerificationRequired,
          emailVerificationToken: ENV.emailVerificationRequired ? verificationToken : null,
          loginMethod: "email",
          role: "user",
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        });

        if (!user) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create user",
          });
        }

        if (ENV.emailVerificationRequired) {
          const verificationCode = nanoid(32);
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          const verificationUrl = new URL("/verify-email", ENV.appBaseUrl);
          verificationUrl.searchParams.set("code", verificationCode);

          await createEmailVerificationCode({
            userId: user.id,
            code: verificationCode,
            expiresAt,
          });

          await sendVerificationEmail({
            to: input.email,
            name: input.name,
            verificationUrl: verificationUrl.toString(),
          });

          return {
            success: true,
            message: "Account created. Check your email to verify your address.",
            requiresVerification: true,
          };
        }

        // Create session immediately for launch readiness.
        const sessionToken = await sdk.createSessionToken(user.openId!, {
          name: user.name || user.email || "User",
        });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, cookieOptions);

        return {
          success: true,
          message: "Account created successfully.",
          requiresVerification: false,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
          },
        };
      }),

    // Verify email with code
    verifyEmail: publicProcedure
      .input(z.object({
        code: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Get verification code
        const verificationCode = await getEmailVerificationCode(input.code);

        if (!verificationCode) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid verification code",
          });
        }

        // Check if expired
        if (new Date() > verificationCode.expiresAt) {
          await deleteEmailVerificationCode(input.code);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Verification code has expired",
          });
        }

        // Verify user email
        await verifyUserEmail(verificationCode.userId);
        await deleteEmailVerificationCode(input.code);

        const user = await getUserById(verificationCode.userId);
        if (user?.openId) {
          const sessionToken = await sdk.createSessionToken(user.openId, {
            name: user.name || user.email || "User",
          });
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, sessionToken, cookieOptions);
        }

        return {
          success: true,
          message: "Email verified successfully",
        };
      }),

    // Sign in with email and password
    signIn: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await getUserByEmail(input.email);

        if (!user || !user.passwordHash) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          });
        }

        if (!user.emailVerified) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Please verify your email before logging in",
          });
        }

        const isPasswordValid = await verifyPassword(input.password, user.passwordHash);
        if (!isPasswordValid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          });
        }

        // Create session
        const sessionToken = await sdk.createSessionToken(user.openId!, {
          name: user.name || user.email || "User",
        });

        // Set cookie
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, cookieOptions);

        return {
          success: true,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
          },
        };
      }),
  }),

  // Meeting procedures
  meetings: router({
    // Create a new meeting
    create: protectedProcedure
      .input(z.object({
        title: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const meetingId = nanoid(10).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
        const uniqueMeetingId = `${meetingId}-${Date.now().toString(36)}`.slice(0, 20);

        await createMeeting({
          meetingId: uniqueMeetingId,
          hostId: ctx.user.id,
          title: input.title || `Meeting with ${ctx.user.name}`,
          status: "active",
        });

        return {
          meetingId: uniqueMeetingId,
          title: input.title || `Meeting with ${ctx.user.name}`,
        };
      }),

    // Get meeting details
    get: publicProcedure
      .input(z.object({
        meetingId: z.string(),
      }))
      .query(async ({ input }) => {
        const meeting = await getMeetingByMeetingId(input.meetingId);

        if (!meeting) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Meeting not found",
          });
        }

        if (meeting.status === "ended") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This meeting has ended",
          });
        }

        const participants = await getParticipantsByMeetingId(meeting.id);

        return {
          meetingId: meeting.meetingId,
          title: meeting.title,
          hostId: meeting.hostId,
          status: meeting.status,
          participantCount: participants.length,
          createdAt: meeting.createdAt,
        };
      }),

    // Join a meeting
    join: publicProcedure
      .input(z.object({
        meetingId: z.string(),
        displayName: z.string().min(1).max(255),
      }))
      .mutation(async ({ input }) => {
        const meeting = await getMeetingByMeetingId(input.meetingId);

        if (!meeting) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Meeting not found",
          });
        }

        if (meeting.status === "ended") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This meeting has ended",
          });
        }

        const result = await addParticipant({
          meetingId: meeting.id,
          userId: null,
          displayName: input.displayName,
          audioEnabled: 1,
          videoEnabled: 1,
        });

        return {
          participantId: result?.id || 0,
          meetingId: meeting.meetingId,
          title: meeting.title,
        };
      }),

    // Get participants in a meeting
    getParticipants: publicProcedure
      .input(z.object({
        meetingId: z.string(),
      }))
      .query(async ({ input }) => {
        const meeting = await getMeetingByMeetingId(input.meetingId);

        if (!meeting) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Meeting not found",
          });
        }

        const participants = await getParticipantsByMeetingId(meeting.id);

        return participants.map(p => ({
          id: p.id,
          displayName: p.displayName,
          audioEnabled: p.audioEnabled === 1,
          videoEnabled: p.videoEnabled === 1,
          joinedAt: p.joinedAt,
        }));
      }),

    // Leave a meeting
    leave: publicProcedure
      .input(z.object({
        participantId: z.number(),
      }))
      .mutation(async ({ input }) => {
        await removeParticipant(input.participantId);
        return { success: true };
      }),

    // Update participant audio status
    updateAudio: publicProcedure
      .input(z.object({
        participantId: z.number(),
        enabled: z.boolean(),
      }))
      .mutation(async ({ input }) => {
        await updateParticipantAudioStatus(input.participantId, input.enabled);
        return { success: true };
      }),

    // Update participant video status
    updateVideo: publicProcedure
      .input(z.object({
        participantId: z.number(),
        enabled: z.boolean(),
      }))
      .mutation(async ({ input }) => {
        await updateParticipantVideoStatus(input.participantId, input.enabled);
        return { success: true };
      }),

    // End a meeting (host only)
    end: protectedProcedure
      .input(z.object({
        meetingId: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const meeting = await getMeetingByMeetingId(input.meetingId);

        if (!meeting) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Meeting not found",
          });
        }

        if (meeting.hostId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the host can end the meeting",
          });
        }

        await endMeeting(input.meetingId);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
