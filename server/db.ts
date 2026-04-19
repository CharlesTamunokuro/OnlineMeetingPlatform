import { eq, and, isNull, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, meetings, participants, InsertMeeting, InsertParticipant, emailVerificationCodes, InsertEmailVerificationCode } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createUser(data: InsertUser) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(users).values(data);
  const userId = (result as any).insertId;

  if (userId) {
    const createdById = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (createdById[0]) {
      return createdById[0];
    }
  }

  // mysql2/drizzle may not always expose insertId in the shape we expect.
  if (data.email) {
    const createdByEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (createdByEmail[0]) {
      return createdByEmail[0];
    }
  }

  if (data.openId) {
    const createdByOpenId = await db
      .select()
      .from(users)
      .where(eq(users.openId, data.openId))
      .limit(1);

    if (createdByOpenId[0]) {
      return createdByOpenId[0];
    }
  }

  return undefined;
}

export async function createEmailVerificationCode(data: InsertEmailVerificationCode) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(emailVerificationCodes).values(data);
}

export async function getEmailVerificationCode(code: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(emailVerificationCodes)
    .where(eq(emailVerificationCodes.code, code))
    .limit(1);
  
  return result.length > 0 ? result[0] : undefined;
}

export async function verifyUserEmail(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(users)
    .set({ emailVerified: true, emailVerificationToken: null })
    .where(eq(users.id, userId));
}

export async function deleteEmailVerificationCode(code: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.code, code));
}

// Meeting-related queries
export async function createMeeting(data: InsertMeeting) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(meetings).values(data);
  return result;
}

export async function getMeetingByMeetingId(meetingId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(meetings).where(eq(meetings.meetingId, meetingId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getMeetingById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(meetings).where(eq(meetings.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function endMeeting(meetingId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(meetings)
    .set({ status: "ended", endedAt: new Date() })
    .where(eq(meetings.meetingId, meetingId));
}

// Participant-related queries
export async function addParticipant(data: InsertParticipant) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(participants).values(data);
  const participantId = (result as any).insertId;

  if (participantId) {
    const insertedById = await db.select().from(participants)
      .where(eq(participants.id, participantId))
      .limit(1);

    if (insertedById[0]) {
      return insertedById[0];
    }
  }

  const insertedByFields = await db.select().from(participants)
    .where(and(
      eq(participants.meetingId, data.meetingId),
      eq(participants.displayName, data.displayName),
      isNull(participants.leftAt),
    ))
    .orderBy(desc(participants.id))
    .limit(1);
  
  return insertedByFields[0];
}

export async function getParticipantsByMeetingId(meetingId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(participants)
    .where(and(eq(participants.meetingId, meetingId), isNull(participants.leftAt)));
  return result;
}

export async function removeParticipant(participantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(participants)
    .set({ leftAt: new Date() })
    .where(eq(participants.id, participantId));
}

export async function updateParticipantAudioStatus(participantId: number, enabled: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(participants)
    .set({ audioEnabled: enabled ? 1 : 0 })
    .where(eq(participants.id, participantId));
}

export async function updateParticipantVideoStatus(participantId: number, enabled: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(participants)
    .set({ videoEnabled: enabled ? 1 : 0 })
    .where(eq(participants.id, participantId));
}
