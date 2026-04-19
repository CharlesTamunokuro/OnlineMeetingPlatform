import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MailCheck, Loader2, CircleAlert } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const hasTriggeredRef = useRef(false);
  const code = new URLSearchParams(window.location.search).get("code") || "";
  const verifyEmailMutation = trpc.auth.verifyEmail.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!code || hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;

    verifyEmailMutation
      .mutateAsync({ code })
      .then(async () => {
        await utils.auth.me.invalidate();
        toast.success("Email verified successfully");
      })
      .catch((error: any) => {
        toast.error(error?.message || "Failed to verify email");
      });
  }, [code, utils.auth.me, verifyEmailMutation]);

  const isSuccess = verifyEmailMutation.isSuccess;
  const isError = verifyEmailMutation.isError;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-0 shadow-lg p-8 text-center">
        {verifyEmailMutation.isPending && (
          <>
            <Loader2 className="w-10 h-10 text-blue-600 mx-auto animate-spin mb-4" />
            <h1 className="text-xl font-semibold text-slate-900 mb-2">Verifying your email</h1>
            <p className="text-slate-600">Please wait while we confirm your account.</p>
          </>
        )}

        {isSuccess && (
          <>
            <MailCheck className="w-10 h-10 text-green-600 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-slate-900 mb-2">Email verified</h1>
            <p className="text-slate-600 mb-6">
              Your account is ready and you are now signed in.
            </p>
            <Button onClick={() => setLocation("/")}>Continue</Button>
          </>
        )}

        {isError && (
          <>
            <CircleAlert className="w-10 h-10 text-red-600 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-slate-900 mb-2">Verification failed</h1>
            <p className="text-slate-600 mb-6">
              This verification link is invalid or has expired.
            </p>
            <Button variant="outline" onClick={() => setLocation("/signup")}>
              Back to Sign Up
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
