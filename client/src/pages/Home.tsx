import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Video, Users, Copy, Check } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { saveMeetingDisplayName } from "@/lib/meetingSession";

export default function Home() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [joinMeetingId, setJoinMeetingId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [copiedMeetingId, setCopiedMeetingId] = useState("");
  const [createdMeetingId, setCreatedMeetingId] = useState("");
  const [isJoiningMeeting, setIsJoiningMeeting] = useState(false);

  const createMeetingMutation = trpc.meetings.create.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();
  const utils = trpc.useUtils();

  const handleCreateMeeting = async () => {
    if (!user) {
      toast.error("Please sign in to create a meeting");
      return;
    }

    try {
      const result = await createMeetingMutation.mutateAsync({
        title: meetingTitle || `Meeting with ${user.name}`,
      });

      saveMeetingDisplayName(result.meetingId, user.name || "Host");
      setCreatedMeetingId(result.meetingId);
      setCreateDialogOpen(false);
      setMeetingTitle("");

      // Redirect to meeting room after a short delay
      setTimeout(() => {
        setLocation(`/meeting/${result.meetingId}`);
      }, 500);
    } catch (error) {
      toast.error("Failed to create meeting");
    }
  };

  const handleJoinMeeting = async () => {
    if (!joinMeetingId.trim()) {
      toast.error("Please enter a meeting ID");
      return;
    }

    if (!displayName.trim()) {
      toast.error("Please enter your name");
      return;
    }

    try {
      setIsJoiningMeeting(true);
      const normalizedMeetingId = joinMeetingId.trim();
      const normalizedDisplayName = displayName.trim();

      await utils.meetings.get.fetch({
        meetingId: normalizedMeetingId,
      });

      saveMeetingDisplayName(normalizedMeetingId, normalizedDisplayName);
      setJoinDialogOpen(false);
      setJoinMeetingId("");
      setDisplayName("");

      // Redirect to meeting room
      setLocation(`/meeting/${normalizedMeetingId}`);
    } catch (error: any) {
      if (error.message?.includes("not found")) {
        toast.error("Meeting not found");
      } else if (error.message?.includes("ended")) {
        toast.error("This meeting has ended");
      } else {
        toast.error("Failed to join meeting");
      }
    } finally {
      setIsJoiningMeeting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMeetingId(text);
    toast.success("Meeting ID copied to clipboard");
    setTimeout(() => setCopiedMeetingId(""), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="animate-spin">
          <Video className="w-12 h-12 text-blue-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg">
              <Video className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent">
              CMA Meet
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-4">
                <div className="text-sm text-slate-600">
                  Welcome, <span className="font-semibold text-slate-900">{user.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await logoutMutation.mutateAsync();
                    window.location.reload();
                  }}
                  className="text-slate-600 hover:text-red-600"
                >
                  Logout
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <a href="/login" className="px-4 py-2 text-blue-600 text-sm font-semibold rounded-lg hover:bg-blue-50 transition-colors">
                  Sign In
                </a>
                <a href="/signup" className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                  Sign Up
                </a>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        {/* Hero Section */}
        <div className="text-center mb-12 md:mb-20">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Connect with anyone, anywhere
          </h2>
          <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto">
            Start or join a meeting instantly. Crystal-clear video and audio for seamless communication.
          </p>
        </div>

        {/* Action Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-2xl mx-auto mb-12">
          {/* Create Meeting Card */}
          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow overflow-hidden group">
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-8 text-white">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold">Start a Meeting</h3>
                <div className="p-3 bg-white/20 rounded-lg group-hover:bg-white/30 transition-colors">
                  <Video className="w-6 h-6" />
                </div>
              </div>
              <p className="text-blue-100 mb-6">
                Create a new meeting and invite others to join
              </p>
              <Button
                onClick={() => setCreateDialogOpen(true)}
                className="w-full bg-white text-blue-600 hover:bg-blue-50 font-semibold"
                disabled={createMeetingMutation.isPending}
              >
                {createMeetingMutation.isPending ? "Creating..." : "Create Meeting"}
              </Button>
            </div>
          </Card>

          {/* Join Meeting Card */}
          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow overflow-hidden group">
            <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 p-8 text-white">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold">Join a Meeting</h3>
                <div className="p-3 bg-white/20 rounded-lg group-hover:bg-white/30 transition-colors">
                  <Users className="w-6 h-6" />
                </div>
              </div>
              <p className="text-emerald-100 mb-6">
                Join an existing meeting with a meeting ID
              </p>
              <Button
                onClick={() => setJoinDialogOpen(true)}
                className="w-full bg-white text-emerald-600 hover:bg-emerald-50 font-semibold"
                disabled={isJoiningMeeting}
              >
                Join Meeting
              </Button>
            </div>
          </Card>
        </div>

        {/* Features Section */}
        <div className="mt-16 grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-blue-100 text-blue-600 mb-4">
              <Video className="w-6 h-6" />
            </div>
            <h4 className="font-semibold text-slate-900 mb-2">HD Video</h4>
            <p className="text-slate-600 text-sm">Crystal-clear video quality for face-to-face conversations</p>
          </div>
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-blue-100 text-blue-600 mb-4">
              <Users className="w-6 h-6" />
            </div>
            <h4 className="font-semibold text-slate-900 mb-2">Easy Sharing</h4>
            <p className="text-slate-600 text-sm">Share meeting links instantly with anyone</p>
          </div>
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-blue-100 text-blue-600 mb-4">
              <Check className="w-6 h-6" />
            </div>
            <h4 className="font-semibold text-slate-900 mb-2">Simple Controls</h4>
            <p className="text-slate-600 text-sm">Intuitive controls for audio and video management</p>
          </div>
        </div>
      </main>

      {/* Create Meeting Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create a New Meeting</DialogTitle>
            <DialogDescription>
              Give your meeting a title (optional) and start connecting
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Meeting Title (Optional)</Label>
              <Input
                id="title"
                placeholder="Team Standup"
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                className="mt-2"
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateMeeting}
                disabled={createMeetingMutation.isPending}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {createMeetingMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Join Meeting Dialog */}
      <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Join a Meeting</DialogTitle>
            <DialogDescription>
              Enter the meeting ID and your name to join
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="meetingId">Meeting ID</Label>
              <Input
                id="meetingId"
                placeholder="abc-def-ghi"
                value={joinMeetingId}
                onChange={(e) => setJoinMeetingId(e.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="displayName">Your Name</Label>
              <Input
                id="displayName"
                placeholder="John Doe"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-2"
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setJoinDialogOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleJoinMeeting}
                disabled={isJoiningMeeting}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                {isJoiningMeeting ? "Joining..." : "Join"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Created Meeting Toast */}
      {createdMeetingId && (
        <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-lg p-4 max-w-sm border border-slate-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-slate-900 mb-1">Meeting Created</p>
              <p className="text-sm text-slate-600 mb-3">Share this ID with others:</p>
              <code className="text-sm bg-slate-100 px-3 py-2 rounded font-mono text-slate-900">
                {createdMeetingId}
              </code>
            </div>
            <button
              onClick={() => copyToClipboard(createdMeetingId)}
              className="flex-shrink-0 p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {copiedMeetingId === createdMeetingId ? (
                <Check className="w-5 h-5 text-green-600" />
              ) : (
                <Copy className="w-5 h-5 text-slate-600" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
