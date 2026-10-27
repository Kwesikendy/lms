import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Room,
  RoomEvent,
  ConnectionState,
  Track,
} from 'livekit-client';
import {
  AlertCircle,
  Camera,
  CameraOff,
  CircleDot,
  Info,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PowerOff,
  Radio,
  Send,
  Settings,
  ShieldCheck,
  Users,
  Video,
  Wifi,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';
import { apiRequest } from '../../lib/api.js';
import {
  Badge,
  Button,
  Card,
  LinkButton,
  SelectField,
} from '../../components/ui/index.js';

interface JoinResponse {
  token: string;
  wsUrl: string;
  roomName: string;
  sessionId: string;
  sessionTitle: string;
  sessionStatus: 'scheduled' | 'live' | 'ended' | 'canceled';
  participantRole: 'instructor' | 'moderator' | 'student';
  livekitConfigured: boolean;
  recordingEnabled: boolean;
  recordingStatus: string;
  permissions: {
    canPublish: boolean;
    canSubscribe: boolean;
    canPublishData: boolean;
    roomAdmin: boolean;
  };
}

interface ChatMessage {
  id: string;
  senderName: string;
  senderRole: string;
  text: string;
  timestamp: string;
}

interface RosterMember {
  id: string;
  name: string;
  role: string;
  isSpeaking?: boolean;
}

export const LiveClassroomPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user, notify } = useApp();
  const navigate = useNavigate();

  const [joinData, setJoinData] = useState<JoinResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // LiveKit Room & WebRTC Media States
  const roomRef = useRef<Room | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  const [connectionState, setConnectionState] = useState<string>('authorizing');
  const [micEnabled, setMicEnabled] = useState(false);
  const [camEnabled, setCamEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [mediaPermissionError, setMediaPermissionError] = useState<string | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<string>('none');

  // Hardware Devices
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('');
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>('');
  const [showDeviceSelector, setShowDeviceSelector] = useState(false);

  // Side Panel: 'participants' | 'chat'
  const [sideTab, setSideTab] = useState<'participants' | 'chat'>('participants');
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');

  const cleanupMediaAndRoom = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
  }, []);

  const authorizeAndConnect = useCallback(async () => {
    if (!sessionId) return;
    if (!user) {
      navigate(`/auth?redirect=/classroom/${sessionId}`);
      return;
    }

    setLoading(true);
    setAuthError(null);
    setConnectionState('authorizing');

    try {
      // 1. Request short-lived server-signed LiveKit token & verify course entitlement
      const data = await apiRequest<JoinResponse>(
        `/api/livekit/sessions/${sessionId}/join`,
        { method: 'POST' }
      );
      setJoinData(data);
      setRecordingStatus(data.recordingStatus || 'none');

      // Fetch attendance roster from backend
      const sesInfo = await apiRequest<{
        attendance: Array<{ user_id: string; full_name: string; role: string; left_at: string | null }>;
      }>(`/api/livekit/sessions/${sessionId}`);

      const activeAttendance = (sesInfo.attendance || [])
        .filter((a) => !a.left_at)
        .map((a) => ({
          id: a.user_id,
          name: a.full_name,
          role: a.role,
        }));
      setRoster(
        activeAttendance.length > 0
          ? activeAttendance
          : [{ id: user.id, name: user.full_name, role: data.participantRole }]
      );

      // Enumerate available media hardware devices if supported by browser
      if (navigator.mediaDevices?.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          setAudioDevices(devices.filter((d) => d.kind === 'audioinput'));
          setVideoDevices(devices.filter((d) => d.kind === 'videoinput'));
        } catch {
          // ignore device enumeration error
        }
      }

      // 2. Connect to LiveKit Server if LIVEKIT_URL is configured
      if (data.livekitConfigured && data.wsUrl) {
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        });
        roomRef.current = room;

        room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          setConnectionState(state);
        });

        room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
          try {
            const msg = JSON.parse(new TextDecoder().decode(payload)) as ChatMessage;
            setChatMessages((prev) => [...prev, msg]);
          } catch {
            // ignore malformed data packet
          }
        });

        await room.connect(data.wsUrl, data.token);
        setConnectionState('connected');
      } else {
        // Token is minted & verified on backend; awaiting external LiveKit SFU URL
        setConnectionState('token_verified_awaiting_sfu');
      }
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'You are not authorized to join this classroom session.'
      );
      setConnectionState('rejected');
    } finally {
      setLoading(false);
    }
  }, [sessionId, user, navigate]);

  useEffect(() => {
    authorizeAndConnect();
    return () => {
      cleanupMediaAndRoom();
    };
  }, [authorizeAndConnect, cleanupMediaAndRoom]);

  // Toggle Camera with graceful hardware/permission handling
  const handleToggleCamera = async () => {
    setMediaPermissionError(null);
    if (camEnabled) {
      if (roomRef.current && joinData?.livekitConfigured) {
        await roomRef.current.localParticipant.setCameraEnabled(false);
      }
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((t) => t.stop());
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      setCamEnabled(false);
      return;
    }

    try {
      if (roomRef.current && joinData?.livekitConfigured) {
        await roomRef.current.localParticipant.setCameraEnabled(true);
        const pub = roomRef.current.localParticipant.getTrackPublication(
          Track.Source.Camera
        );
        if (pub?.videoTrack && localVideoRef.current) {
          pub.videoTrack.attach(localVideoRef.current);
        }
        setCamEnabled(true);
      } else if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: selectedVideoDevice ? { deviceId: selectedVideoDevice } : true,
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setCamEnabled(true);
      } else {
        setMediaPermissionError('Camera capture is not supported in this browser environment.');
      }
    } catch (err) {
      setMediaPermissionError(
        err instanceof Error
          ? `Camera permission denied or unavailable: ${err.message}`
          : 'Camera permission was denied.'
      );
    }
  };

  // Toggle Microphone with graceful permission handling
  const handleToggleMic = async () => {
    setMediaPermissionError(null);
    if (micEnabled) {
      if (roomRef.current && joinData?.livekitConfigured) {
        await roomRef.current.localParticipant.setMicrophoneEnabled(false);
      }
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((t) => t.stop());
      }
      setMicEnabled(false);
      return;
    }

    try {
      if (roomRef.current && joinData?.livekitConfigured) {
        await roomRef.current.localParticipant.setMicrophoneEnabled(true);
        setMicEnabled(true);
      } else if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: selectedAudioDevice ? { deviceId: selectedAudioDevice } : true,
        });
        localStreamRef.current = stream;
        setMicEnabled(true);
      } else {
        setMediaPermissionError('Microphone access is not available in this browser.');
      }
    } catch (err) {
      setMediaPermissionError(
        err instanceof Error
          ? `Microphone permission denied or unavailable: ${err.message}`
          : 'Microphone permission was denied.'
      );
    }
  };

  // Toggle Screen Share
  const handleToggleScreenShare = async () => {
    setMediaPermissionError(null);
    if (screenSharing) {
      if (roomRef.current && joinData?.livekitConfigured) {
        await roomRef.current.localParticipant.setScreenShareEnabled(false);
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      setScreenSharing(false);
      return;
    }

    try {
      if (roomRef.current && joinData?.livekitConfigured) {
        await roomRef.current.localParticipant.setScreenShareEnabled(true);
        setScreenSharing(true);
      } else if (navigator.mediaDevices?.getDisplayMedia) {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
          setScreenSharing(false);
        });
        setScreenSharing(true);
      } else {
        setMediaPermissionError('Screen sharing is not supported on this device.');
      }
    } catch (err) {
      setMediaPermissionError(
        err instanceof Error ? `Screen share canceled: ${err.message}` : 'Screen share failed.'
      );
    }
  };

  // Send Classroom Chat Message
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !user || !joinData) return;

    const msg: ChatMessage = {
      id: Math.random().toString(36).slice(2, 9),
      senderName: user.full_name,
      senderRole: joinData.participantRole,
      text: chatInput.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    if (roomRef.current && joinData.livekitConfigured) {
      try {
        const bytes = new TextEncoder().encode(JSON.stringify(msg));
        await roomRef.current.localParticipant.publishData(bytes, { reliable: true });
      } catch {
        // fallback local append
      }
    }

    setChatMessages((prev) => [...prev, msg]);
    setChatInput('');
  };

  // Leave Session (Participant leaves; session remains open for everyone else)
  const handleLeaveClassroom = async () => {
    cleanupMediaAndRoom();
    if (sessionId) {
      try {
        await apiRequest(`/api/livekit/sessions/${sessionId}/leave`, {
          method: 'POST',
        });
      } catch {
        // ignore
      }
    }
    notify({
      type: 'info',
      title: 'Left Classroom',
      message: 'You have disconnected from the classroom session.',
    });
    navigate('/student/live');
  };

  // End Session for Everyone (Strictly restricted to Instructor or Admin)
  const handleEndSessionForAll = async () => {
    if (!sessionId) return;
    try {
      await apiRequest(`/api/livekit/sessions/${sessionId}/state`, {
        method: 'POST',
        body: JSON.stringify({ status: 'ended' }),
      });
      cleanupMediaAndRoom();
      notify({
        type: 'success',
        title: 'Live Session Ended',
        message: 'The classroom session has been closed for all participants.',
      });
      navigate('/instructor/live');
    } catch (err) {
      notify({
        type: 'error',
        title: 'Permission Denied',
        message: err instanceof Error ? err.message : 'Could not end session.',
      });
    }
  };

  // Start / Stop Recording (Instructor/Admin only, verifies Egress configuration)
  const handleToggleRecording = async () => {
    if (!sessionId) return;
    const nextAction = recordingStatus === 'recording' ? 'stop' : 'start';
    try {
      const res = await apiRequest<{ recordingStatus: string }>(
        `/api/livekit/sessions/${sessionId}/recording`,
        {
          method: 'POST',
          body: JSON.stringify({ action: nextAction }),
        }
      );
      setRecordingStatus(res.recordingStatus);
    } catch (err) {
      notify({
        type: 'error',
        title: 'Recording Service Notice',
        message:
          err instanceof Error
            ? err.message
            : 'LiveKit Egress service is required for server-side recording.',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-6">
        <Card tone="plain" padding="lg" className="max-w-md w-full text-center space-y-4">
          <div className="size-12 rounded-full bg-accent-soft text-accent flex items-center justify-center mx-auto">
            <Radio className="size-6 animate-pulse" />
          </div>
          <div>
            <h1 className="font-serif text-lg text-ink font-semibold">
              Connecting to Live Classroom
            </h1>
            <p className="text-xs text-ink-3 mt-1">
              Verifying enrollment token, minting room grant, and initializing WebRTC stream.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (authError || !joinData) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <Card tone="plain" padding="lg" className="border-danger/30 text-center space-y-4">
          <div className="size-12 rounded-full bg-danger-soft text-danger flex items-center justify-center mx-auto">
            <AlertCircle className="size-6" />
          </div>
          <div>
            <h1 className="font-serif text-xl text-ink font-semibold">
              Classroom Access Restricted
            </h1>
            <p className="text-sm text-ink-2 mt-1">{authError}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <LinkButton to="/courses" variant="accent" size="sm">
              View Course Enrollment
            </LinkButton>
            <LinkButton to="/student/live" variant="secondary" size="sm">
              Back to Schedule
            </LinkButton>
          </div>
        </Card>
      </div>
    );
  }

  const isModerator = joinData.permissions.roomAdmin;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      {/* Editorial Classroom Header */}
      <Card tone="plain" padding="sm" className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-10 rounded-full bg-accent-soft text-accent flex items-center justify-center shrink-0">
            <Radio className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge tone="accent" dot>
                {joinData.sessionStatus.toUpperCase()}
              </Badge>
              <Badge tone="neutral">
                Role: {joinData.participantRole}
              </Badge>
              <span className="text-xs font-mono text-ink-3 hidden sm:inline">
                Room: {joinData.roomName}
              </span>
            </div>
            <h1 className="font-serif text-base sm:text-lg text-ink font-semibold truncate mt-0.5">
              {joinData.sessionTitle}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Connection state pill */}
          <div className="h-8 px-3 rounded-full border border-line bg-canvas flex items-center gap-2 text-xs font-mono text-ink-2">
            <Wifi
              className={`size-3.5 ${
                connectionState === 'connected' ? 'text-success' : 'text-accent'
              }`}
            />
            <span className="hidden sm:inline">
              {connectionState === 'connected'
                ? 'LiveKit SFU Active'
                : 'JWT Minted & Stream Ready'}
            </span>
          </div>

          <div className="h-8 px-3 rounded-full border border-line bg-canvas flex items-center gap-1.5 text-xs text-ink-2">
            <Users className="size-3.5 text-ink-3" />
            <span className="font-mono font-medium">{roster.length}</span>
          </div>
        </div>
      </Card>

      {/* Credential Status Notice if LiveKit Server URL isn't configured */}
      {!joinData.livekitConfigured && (
        <div className="px-4 py-3 rounded-2xl border border-accent/25 bg-accent-soft flex flex-wrap items-center justify-between gap-3 text-xs text-accent-ink">
          <div className="flex items-start gap-2.5">
            <Info className="size-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">
                Short-lived LiveKit token generated and cryptographically signed.
              </p>
              <p className="text-[11px] opacity-85 mt-0.5">
                Local media preview and P2P capture are active. Connect a LiveKit Cloud or self-hosted SFU endpoint via <code>LIVEKIT_URL</code> in <code>.env</code> for live multi-peer SFU distribution.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Media Hardware / Permission Error Notice */}
      {mediaPermissionError && (
        <div className="px-4 py-3 rounded-2xl border border-danger/30 bg-danger-soft flex items-center justify-between gap-3 text-xs text-danger">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{mediaPermissionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setMediaPermissionError(null)}
            className="text-danger hover:opacity-75"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Classroom Stage & Sidebar Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Main Stage & Video Deck */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="relative rounded-3xl bg-[#111215] border border-[#23262d] overflow-hidden min-h-[380px] sm:min-h-[480px] flex flex-col justify-between p-6 shadow-md text-white">
            {/* Real local / screen share video track */}
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 size-full object-cover transition-opacity duration-300 ${
                camEnabled || screenSharing ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            />

            {/* Video overlay top status bar */}
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full text-xs font-mono uppercase tracking-wider bg-white/10 backdrop-blur-md border border-white/15 text-white">
                  {screenSharing ? 'Screen Share' : 'Main Stage'}
                </span>
                {recordingStatus === 'recording' && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-mono uppercase tracking-wider bg-danger/80 backdrop-blur-md text-white flex items-center gap-1.5 animate-pulse">
                    <CircleDot className="size-3" /> Recording
                  </span>
                )}
              </div>
              <span className="text-xs font-mono text-white/70 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                {user?.full_name} ({joinData.participantRole})
              </span>
            </div>

            {/* Empty camera placeholder */}
            {!camEnabled && !screenSharing && (
              <div className="relative z-10 my-auto text-center space-y-3 max-w-sm mx-auto">
                <div className="size-20 rounded-full bg-white/10 border border-white/15 backdrop-blur-md flex items-center justify-center mx-auto text-2xl font-serif text-white">
                  {user?.full_name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)}
                </div>
                <div>
                  <h3 className="font-serif text-lg text-white font-medium">
                    {joinData.sessionTitle}
                  </h3>
                  <p className="text-xs text-white/60 mt-1">
                    Your camera and microphone are currently off. Use the control bar below to broadcast audio or video.
                  </p>
                </div>
              </div>
            )}

            {/* Mini participant tiles along bottom of stage */}
            <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-4">
              {roster.slice(0, 4).map((p) => (
                <div
                  key={p.id}
                  className="px-3 py-2 rounded-2xl bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white truncate">{p.name}</p>
                    <p className="text-[10px] font-mono uppercase text-white/60">{p.role}</p>
                  </div>
                  <Mic className="size-3.5 text-white/40 shrink-0" />
                </div>
              ))}
            </div>
          </div>

          {/* Frosted Media Controls Bar */}
          <div
            role="toolbar"
            aria-label="Classroom media controls"
            className="rounded-2xl border border-line bg-card p-3 shadow-soft flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={micEnabled ? 'accent' : 'secondary'}
                size="sm"
                onClick={handleToggleMic}
                aria-pressed={micEnabled}
                icon={micEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
              >
                {micEnabled ? 'Mute' : 'Unmute'}
              </Button>

              <Button
                variant={camEnabled ? 'accent' : 'secondary'}
                size="sm"
                onClick={handleToggleCamera}
                aria-pressed={camEnabled}
                icon={camEnabled ? <Camera className="size-4" /> : <CameraOff className="size-4" />}
              >
                {camEnabled ? 'Stop Video' : 'Start Video'}
              </Button>

              <Button
                variant={screenSharing ? 'primary' : 'secondary'}
                size="sm"
                onClick={handleToggleScreenShare}
                aria-pressed={screenSharing}
                icon={<MonitorUp className="size-4" />}
              >
                {screenSharing ? 'Stop Share' : 'Share Screen'}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeviceSelector((s) => !s)}
                aria-label="Device settings"
                icon={<Settings className="size-4" />}
              >
                Settings
              </Button>

              {isModerator && (
                <Button
                  variant={recordingStatus === 'recording' ? 'danger' : 'secondary'}
                  size="sm"
                  onClick={handleToggleRecording}
                  icon={<CircleDot className="size-4" />}
                >
                  {recordingStatus === 'recording' ? 'Stop Rec' : 'Record'}
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleLeaveClassroom}
                icon={<LogOut className="size-4" />}
              >
                Leave Room
              </Button>
              {isModerator && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleEndSessionForAll}
                  icon={<PowerOff className="size-4" />}
                >
                  End for All
                </Button>
              )}
            </div>
          </div>

          {/* Hardware Device Selection Panel */}
          {showDeviceSelector && (
            <Card tone="plain" padding="md" className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-sm font-semibold text-ink">
                  Audio & Video Hardware
                </h3>
                <button
                  type="button"
                  onClick={() => setShowDeviceSelector(false)}
                  className="text-ink-3 hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SelectField
                  label="Microphone"
                  value={selectedAudioDevice}
                  onChange={(e) => setSelectedAudioDevice(e.target.value)}
                  options={[
                    { value: '', label: 'System Default Microphone' },
                    ...audioDevices.map((d, i) => ({
                      value: d.deviceId,
                      label: d.label || `Microphone ${i + 1}`,
                    })),
                  ]}
                />
                <SelectField
                  label="Camera"
                  value={selectedVideoDevice}
                  onChange={(e) => setSelectedVideoDevice(e.target.value)}
                  options={[
                    { value: '', label: 'System Default Camera' },
                    ...videoDevices.map((d, i) => ({
                      value: d.deviceId,
                      label: d.label || `Camera ${i + 1}`,
                    })),
                  ]}
                />
              </div>
            </Card>
          )}
        </div>

        {/* Right Side Panel: Participants & Classroom Chat */}
        <div className="lg:col-span-4 flex flex-col">
          <Card
            tone="plain"
            padding="none"
            className="flex-1 flex flex-col overflow-hidden min-h-[480px]"
          >
            {/* Tab Header */}
            <div className="grid grid-cols-2 border-b border-line p-1 bg-canvas">
              <button
                type="button"
                onClick={() => setSideTab('participants')}
                className={`py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  sideTab === 'participants'
                    ? 'bg-card text-ink shadow-xs font-semibold'
                    : 'text-ink-3 hover:text-ink'
                }`}
              >
                <Users className="size-3.5" /> Learners ({roster.length})
              </button>
              <button
                type="button"
                onClick={() => setSideTab('chat')}
                className={`py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  sideTab === 'chat'
                    ? 'bg-card text-ink shadow-xs font-semibold'
                    : 'text-ink-3 hover:text-ink'
                }`}
              >
                <MessageSquare className="size-3.5" /> Class Chat ({chatMessages.length})
              </button>
            </div>

            {/* Panel Content */}
            {sideTab === 'participants' ? (
              <div className="p-4 space-y-2 flex-1 overflow-y-auto">
                {roster.map((member) => (
                  <div
                    key={member.id}
                    className="p-3 rounded-2xl border border-line bg-canvas flex items-center justify-between"
                  >
                    <div>
                      <p className="text-xs font-medium text-ink">{member.name}</p>
                      <span className="text-[10px] font-mono uppercase text-ink-3">
                        {member.role}
                      </span>
                    </div>
                    <Badge tone={member.role === 'instructor' ? 'accent' : 'neutral'}>
                      {member.role === 'instructor' ? 'Host' : 'Active'}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-between p-4">
                <div className="space-y-3 overflow-y-auto max-h-[380px] pr-1">
                  {chatMessages.length === 0 ? (
                    <div className="text-center py-12 text-ink-3 text-xs">
                      No messages yet. Ask technical questions or collaborate with fellow learners.
                    </div>
                  ) : (
                    chatMessages.map((m) => (
                      <div
                        key={m.id}
                        className="p-3 rounded-2xl border border-line bg-canvas space-y-1"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-ink">
                            {m.senderName}{' '}
                            <span className="text-[10px] font-mono font-normal uppercase text-ink-3">
                              ({m.senderRole})
                            </span>
                          </span>
                          <span className="text-xs font-mono text-ink-3">{m.timestamp}</span>
                        </div>
                        <p className="text-xs text-ink-2">{m.text}</p>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleSendChat} className="pt-3 border-t border-line flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Message the class..."
                    aria-label="Classroom message"
                    className="flex-1 px-3.5 py-2 rounded-full border border-line bg-canvas text-xs text-ink placeholder:text-ink-3 focus:outline-none focus:border-ink"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    icon={<Send className="size-3.5" />}
                  >
                    Send
                  </Button>
                </form>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
