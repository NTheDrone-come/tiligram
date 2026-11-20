import { useCallback, useEffect, useRef, useState } from 'react';
import { shouldInitiateOffer } from '../utils/callLogic';
import {
  playCallConnectedSound,
  playCallEndedSound,
  startRingtoneLoop,
} from '../utils/sounds';
import type {
  ActiveCallRoom,
  CallMode,
  CallSignalPayload,
} from '../types/telegram';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export interface UseWebRTCCallOptions {
  currentUserId: string | null;
  activeCalls: ActiveCallRoom[];
  soundEnabled: boolean;
  startCallWs: (chatId: string, mode: CallMode) => void;
  joinCallWs: (callId: string, mode?: CallMode) => void;
  declineCallWs: (callId: string) => void;
  leaveCallWs: (callId: string) => void;
  sendSignalWs: (
    callId: string,
    targetUserId: string,
    signal: CallSignalPayload,
  ) => void;
  updateMediaStateWs: (
    callId: string,
    state: { micMuted: boolean; videoEnabled: boolean; screenSharing: boolean },
  ) => void;
}

export interface WebRTCCallController {
  joinedCall: ActiveCallRoom | null;
  incomingCall: ActiveCallRoom | null;
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  micMuted: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
  minimized: boolean;
  elapsedSec: number;
  mediaWarning: string | null;
  callNotice: string | null;
  setMinimized: (v: boolean) => void;
  initiateCall: (chatId: string, mode: CallMode) => Promise<void>;
  acceptIncomingCall: (mode?: CallMode) => Promise<void>;
  joinExistingCall: (call: ActiveCallRoom, mode?: CallMode) => Promise<void>;
  declineIncomingCall: () => void;
  hangUp: () => void;
  toggleMic: () => void;
  toggleVideo: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  handleIncomingCallEvent: (call: ActiveCallRoom) => void;
  handleCallSignalEvent: (payload: {
    callId: string;
    fromUserId: string;
    signal: CallSignalPayload;
  }) => void;
  handleCallEndedEvent: (payload: {
    callId: string;
    chatId: string;
    reason?: string;
  }) => void;
}

export function useWebRTCCall({
  currentUserId,
  activeCalls,
  soundEnabled,
  startCallWs,
  joinCallWs,
  declineCallWs,
  leaveCallWs,
  sendSignalWs,
  updateMediaStateWs,
}: UseWebRTCCallOptions): WebRTCCallController {
  const [joinedCallId, setJoinedCallId] = useState<string | null>(null);
  const [pendingStartChatId, setPendingStartChatId] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<ActiveCallRoom | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [micMuted, setMicMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [mediaWarning, setMediaWarning] = useState<string | null>(null);
  const [callNotice, setCallNotice] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const joinedCallIdRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | null>(currentUserId);
  currentUserIdRef.current = currentUserId;

  const joinedCall =
    activeCalls.find(
      (c) =>
        (joinedCallId && c.callId === joinedCallId) ||
        (pendingStartChatId &&
          c.chatId === pendingStartChatId &&
          c.participants.some((p) => p.userId === currentUserId)),
    ) ?? null;

  useEffect(() => {
    if (joinedCall && joinedCall.callId !== joinedCallId) {
      setJoinedCallId(joinedCall.callId);
      setPendingStartChatId(null);
    }
  }, [joinedCall, joinedCallId]);

  joinedCallIdRef.current = joinedCall?.callId ?? joinedCallId;

  const showTempNotice = useCallback((text: string) => {
    setCallNotice(text);
    setTimeout(() => {
      setCallNotice((prev) => (prev === text ? null : prev));
    }, 3200);
  }, []);

  const cleanupMediaAndPeers = useCallback(() => {
    for (const pc of peersRef.current.values()) {
      try {
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.close();
      } catch {
        // ignore
      }
    }
    peersRef.current.clear();
    pendingIceRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (cameraTrackRef.current) {
      cameraTrackRef.current.stop();
      cameraTrackRef.current = null;
    }
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }

    setLocalStream(null);
    setRemoteStreams({});
    setMicMuted(false);
    setVideoEnabled(false);
    setScreenSharing(false);
    setMinimized(false);
    setElapsedSec(0);
    setMediaWarning(null);
  }, []);

  const acquireLocalMedia = useCallback(async (mode: CallMode) => {
    setMediaWarning(null);
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setMediaWarning(
        'Микрофон/камера недоступны в этом контексте — вы подключены в режиме прослушивания.',
      );
      setMicMuted(true);
      setVideoEnabled(false);
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video:
          mode === 'video'
            ? { width: { ideal: 1280 }, height: { ideal: 720 } }
            : false,
      });
      localStreamRef.current = stream;
      cameraTrackRef.current = stream.getVideoTracks()[0] ?? null;
      setLocalStream(stream);
      setMicMuted(false);
      setVideoEnabled(mode === 'video' && stream.getVideoTracks().length > 0);
      return stream;
    } catch {
      if (mode === 'video') {
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
          localStreamRef.current = audioOnly;
          setLocalStream(audioOnly);
          setMicMuted(false);
          setVideoEnabled(false);
          setMediaWarning(
            'Камера недоступна — звонок запущен в аудиорежиме.',
          );
          return audioOnly;
        } catch {
          // fall through to listen-only
        }
      }
      setMediaWarning(
        'Доступ к микрофону отклонён или устройство не найдено — режим прослушивания.',
      );
      setMicMuted(true);
      setVideoEnabled(false);
      return null;
    }
  }, []);

  const createPeerConnection = useCallback(
    (callId: string, remoteUserId: string): RTCPeerConnection => {
      const existing = peersRef.current.get(remoteUserId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peersRef.current.set(remoteUserId, pc);

      const stream = localStreamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) {
          pc.addTrack(track, stream);
        }
      }

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          sendSignalWs(callId, remoteUserId, {
            type: 'ice',
            candidate: {
              candidate: ev.candidate.candidate,
              sdpMid: ev.candidate.sdpMid,
              sdpMLineIndex: ev.candidate.sdpMLineIndex,
            },
          });
        }
      };

      pc.ontrack = (ev) => {
        const remoteStream = ev.streams[0] ?? new MediaStream([ev.track]);
        setRemoteStreams((prev) => ({
          ...prev,
          [remoteUserId]: remoteStream,
        }));
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === 'failed' ||
          pc.connectionState === 'closed'
        ) {
          setRemoteStreams((prev) => {
            if (!prev[remoteUserId]) return prev;
            const next = { ...prev };
            delete next[remoteUserId];
            return next;
          });
        }
      };

      return pc;
    },
    [sendSignalWs],
  );

  // Maintain full WebRTC mesh with all other participants in the joined call
  useEffect(() => {
    if (!joinedCall || !currentUserId) return;

    const activePeerIds = new Set(
      joinedCall.participants
        .map((p) => p.userId)
        .filter((id) => id !== currentUserId),
    );

    // Close peers who left the room
    for (const [peerId, pc] of peersRef.current.entries()) {
      if (!activePeerIds.has(peerId)) {
        pc.close();
        peersRef.current.delete(peerId);
        pendingIceRef.current.delete(peerId);
        setRemoteStreams((prev) => {
          if (!prev[peerId]) return prev;
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
      }
    }

    // Create connections & deterministic offers for newly joined peers
    for (const peerId of activePeerIds) {
      if (!peersRef.current.has(peerId)) {
        const pc = createPeerConnection(joinedCall.callId, peerId);
        if (shouldInitiateOffer(currentUserId, peerId)) {
          (async () => {
            try {
              const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
              });
              await pc.setLocalDescription(offer);
              if (offer.sdp) {
                sendSignalWs(joinedCall.callId, peerId, {
                  type: 'offer',
                  sdp: offer.sdp,
                });
              }
            } catch (err) {
              console.warn('WebRTC offer creation failed:', err);
            }
          })();
        }
      }
    }
  }, [joinedCall, currentUserId, createPeerConnection, sendSignalWs]);

  // Call duration timer
  useEffect(() => {
    if (!joinedCall) {
      setElapsedSec(0);
      return;
    }
    const startTs = new Date(joinedCall.startedAt).getTime();
    const tick = () => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startTs) / 1000)));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [joinedCall?.callId, joinedCall?.startedAt]);

  // Ringtone for incoming call or outgoing P2P call while waiting for peer
  useEffect(() => {
    if (!soundEnabled) return;
    if (incomingCall && !joinedCall) {
      return startRingtoneLoop('incoming');
    }
    if (
      joinedCall &&
      joinedCall.chatType === 'private' &&
      joinedCall.participants.length < 2
    ) {
      return startRingtoneLoop('outgoing');
    }
  }, [
    soundEnabled,
    incomingCall?.callId,
    joinedCall?.callId,
    joinedCall?.chatType,
    joinedCall?.participants.length,
  ]);

  // Play connected chime when a second peer joins
  const prevPeerCountRef = useRef(0);
  useEffect(() => {
    const count = joinedCall?.participants.length ?? 0;
    if (count >= 2 && prevPeerCountRef.current < 2 && soundEnabled) {
      playCallConnectedSound();
    }
    prevPeerCountRef.current = count;
  }, [joinedCall?.participants.length, soundEnabled]);

  const initiateCall = useCallback(
    async (chatId: string, mode: CallMode) => {
      cleanupMediaAndPeers();
      await acquireLocalMedia(mode);
      setIncomingCall(null);
      setPendingStartChatId(chatId);
      setMinimized(false);
      startCallWs(chatId, mode);
    },
    [acquireLocalMedia, cleanupMediaAndPeers, startCallWs],
  );

  const joinExistingCall = useCallback(
    async (call: ActiveCallRoom, mode?: CallMode) => {
      cleanupMediaAndPeers();
      const targetMode = mode ?? call.mode;
      await acquireLocalMedia(targetMode);
      setIncomingCall(null);
      setPendingStartChatId(null);
      setJoinedCallId(call.callId);
      setMinimized(false);
      joinCallWs(call.callId, targetMode);
    },
    [acquireLocalMedia, cleanupMediaAndPeers, joinCallWs],
  );

  const acceptIncomingCall = useCallback(
    async (mode?: CallMode) => {
      if (!incomingCall) return;
      await joinExistingCall(incomingCall, mode ?? incomingCall.mode);
    },
    [incomingCall, joinExistingCall],
  );

  const declineIncomingCall = useCallback(() => {
    if (!incomingCall) return;
    declineCallWs(incomingCall.callId);
    setIncomingCall(null);
  }, [incomingCall, declineCallWs]);

  const hangUp = useCallback(() => {
    const activeId = joinedCallIdRef.current;
    if (activeId) {
      leaveCallWs(activeId);
    }
    if (soundEnabled) playCallEndedSound();
    setJoinedCallId(null);
    setPendingStartChatId(null);
    cleanupMediaAndPeers();
  }, [leaveCallWs, cleanupMediaAndPeers, soundEnabled]);

  const toggleMic = useCallback(() => {
    const nextMuted = !micMuted;
    const stream = localStreamRef.current;
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }
    setMicMuted(nextMuted);
    if (joinedCallIdRef.current) {
      updateMediaStateWs(joinedCallIdRef.current, {
        micMuted: nextMuted,
        videoEnabled,
        screenSharing,
      });
    }
  }, [micMuted, videoEnabled, screenSharing, updateMediaStateWs]);

  const replaceOrAddVideoTrackOnPeers = useCallback(
    async (newTrack: MediaStreamTrack | null) => {
      const callId = joinedCallIdRef.current;
      const stream = localStreamRef.current;

      for (const [peerId, pc] of peersRef.current.entries()) {
        const videoSender = pc
          .getSenders()
          .find((s) => s.track?.kind === 'video');

        if (videoSender) {
          await videoSender.replaceTrack(newTrack);
        } else if (newTrack && stream && callId) {
          pc.addTrack(newTrack, stream);
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            if (offer.sdp) {
              sendSignalWs(callId, peerId, { type: 'offer', sdp: offer.sdp });
            }
          } catch {
            // ignore renegotiation race
          }
        }
      }
    },
    [sendSignalWs],
  );

  const toggleVideo = useCallback(async () => {
    if (screenSharing) {
      // Stop screen sharing first
      screenTrackRef.current?.stop();
      screenTrackRef.current = null;
      setScreenSharing(false);
    }

    const nextEnabled = !videoEnabled;
    if (nextEnabled) {
      try {
        let track = cameraTrackRef.current;
        if (!track || track.readyState === 'ended') {
          const camStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          });
          track = camStream.getVideoTracks()[0] ?? null;
          cameraTrackRef.current = track;
        }
        if (track) {
          track.enabled = true;
          const base = localStreamRef.current ?? new MediaStream();
          base.getVideoTracks().forEach((t) => {
            if (t !== track) base.removeTrack(t);
          });
          if (!base.getVideoTracks().includes(track)) {
            base.addTrack(track);
          }
          localStreamRef.current = base;
          setLocalStream(new MediaStream(base.getTracks()));
          await replaceOrAddVideoTrackOnPeers(track);
          setVideoEnabled(true);
          if (joinedCallIdRef.current) {
            updateMediaStateWs(joinedCallIdRef.current, {
              micMuted,
              videoEnabled: true,
              screenSharing: false,
            });
          }
        }
      } catch {
        setMediaWarning('Не удалось включить камеру — проверьте разрешения.');
      }
    } else {
      if (cameraTrackRef.current) {
        cameraTrackRef.current.enabled = false;
      }
      setVideoEnabled(false);
      if (joinedCallIdRef.current) {
        updateMediaStateWs(joinedCallIdRef.current, {
          micMuted,
          videoEnabled: false,
          screenSharing: false,
        });
      }
    }
  }, [
    videoEnabled,
    screenSharing,
    micMuted,
    replaceOrAddVideoTrackOnPeers,
    updateMediaStateWs,
  ]);

  const toggleScreenShare = useCallback(async () => {
    if (screenSharing) {
      screenTrackRef.current?.stop();
      screenTrackRef.current = null;
      const fallbackCam = videoEnabled ? cameraTrackRef.current : null;
      await replaceOrAddVideoTrackOnPeers(fallbackCam);
      const base = localStreamRef.current;
      if (base) {
        base.getVideoTracks().forEach((t) => {
          if (t !== fallbackCam) base.removeTrack(t);
        });
        if (fallbackCam && !base.getVideoTracks().includes(fallbackCam)) {
          base.addTrack(fallbackCam);
        }
        setLocalStream(new MediaStream(base.getTracks()));
      }
      setScreenSharing(false);
      if (joinedCallIdRef.current) {
        updateMediaStateWs(joinedCallIdRef.current, {
          micMuted,
          videoEnabled,
          screenSharing: false,
        });
      }
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setMediaWarning('Демонстрация экрана не поддерживается этим браузером.');
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return;
      screenTrackRef.current = screenTrack;

      const base = localStreamRef.current ?? new MediaStream();
      base.getVideoTracks().forEach((t) => base.removeTrack(t));
      base.addTrack(screenTrack);
      localStreamRef.current = base;
      setLocalStream(new MediaStream(base.getTracks()));
      await replaceOrAddVideoTrackOnPeers(screenTrack);
      setScreenSharing(true);

      if (joinedCallIdRef.current) {
        updateMediaStateWs(joinedCallIdRef.current, {
          micMuted,
          videoEnabled: true,
          screenSharing: true,
        });
      }

      screenTrack.onended = () => {
        screenTrackRef.current = null;
        setScreenSharing(false);
        const cam = cameraTrackRef.current;
        void replaceOrAddVideoTrackOnPeers(cam && cam.enabled ? cam : null);
        if (joinedCallIdRef.current) {
          updateMediaStateWs(joinedCallIdRef.current, {
            micMuted,
            videoEnabled: Boolean(cam && cam.enabled),
            screenSharing: false,
          });
        }
      };
    } catch {
      // User cancelled screen picker
    }
  }, [
    screenSharing,
    videoEnabled,
    micMuted,
    replaceOrAddVideoTrackOnPeers,
    updateMediaStateWs,
  ]);

  const handleIncomingCallEvent = useCallback((call: ActiveCallRoom) => {
    if (joinedCallIdRef.current === call.callId) return;
    if (call.initiatorId === currentUserIdRef.current) return;
    setIncomingCall(call);
  }, []);

  const handleCallSignalEvent = useCallback(
    async ({
      callId,
      fromUserId,
      signal,
    }: {
      callId: string;
      fromUserId: string;
      signal: CallSignalPayload;
    }) => {
      if (joinedCallIdRef.current !== callId) return;
      const pc = createPeerConnection(callId, fromUserId);

      try {
        if (signal.type === 'offer') {
          await pc.setRemoteDescription(
            new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }),
          );
          const buffered = pendingIceRef.current.get(fromUserId) ?? [];
          for (const ice of buffered) {
            await pc.addIceCandidate(new RTCIceCandidate(ice));
          }
          pendingIceRef.current.delete(fromUserId);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (answer.sdp) {
            sendSignalWs(callId, fromUserId, {
              type: 'answer',
              sdp: answer.sdp,
            });
          }
        } else if (signal.type === 'answer') {
          await pc.setRemoteDescription(
            new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }),
          );
          const buffered = pendingIceRef.current.get(fromUserId) ?? [];
          for (const ice of buffered) {
            await pc.addIceCandidate(new RTCIceCandidate(ice));
          }
          pendingIceRef.current.delete(fromUserId);
        } else if (signal.type === 'ice') {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } else {
            const list = pendingIceRef.current.get(fromUserId) ?? [];
            list.push(signal.candidate);
            pendingIceRef.current.set(fromUserId, list);
          }
        }
      } catch (err) {
        console.warn('WebRTC signaling error:', err);
      }
    },
    [createPeerConnection, sendSignalWs],
  );

  const handleCallEndedEvent = useCallback(
    (payload: { callId: string; chatId: string; reason?: string }) => {
      setIncomingCall((prev) =>
        prev && prev.callId === payload.callId ? null : prev,
      );
      if (joinedCallIdRef.current === payload.callId) {
        if (soundEnabled) playCallEndedSound();
        setJoinedCallId(null);
        setPendingStartChatId(null);
        cleanupMediaAndPeers();
        if (payload.reason) showTempNotice(payload.reason);
      }
    },
    [cleanupMediaAndPeers, showTempNotice, soundEnabled],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupMediaAndPeers();
    };
  }, [cleanupMediaAndPeers]);

  return {
    joinedCall,
    incomingCall,
    localStream,
    remoteStreams,
    micMuted,
    videoEnabled,
    screenSharing,
    minimized,
    elapsedSec,
    mediaWarning,
    callNotice,
    setMinimized,
    initiateCall,
    acceptIncomingCall,
    joinExistingCall,
    declineIncomingCall,
    hangUp,
    toggleMic,
    toggleVideo,
    toggleScreenShare,
    handleIncomingCallEvent,
    handleCallSignalEvent,
    handleCallEndedEvent,
  };
}
