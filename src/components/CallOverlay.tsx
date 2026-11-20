import { useEffect, useRef } from 'react';
import {
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Monitor,
  MonitorOff,
  Phone,
  PhoneOff,
  Users,
  Video,
  VideoOff,
} from 'lucide-react';
import { Avatar } from './Avatar';
import { formatCallElapsed } from '../utils/callLogic';
import type { WebRTCCallController } from '../hooks/useWebRTCCall';
import type { CallParticipant } from '../types/telegram';

interface CallOverlayProps {
  call: WebRTCCallController;
  currentUserId: string;
}

function StreamMediaTile({
  participant,
  stream,
  isSelf,
  isCompact,
}: {
  participant: CallParticipant;
  stream: MediaStream | null;
  isSelf: boolean;
  isCompact: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const hasLiveVideo =
    Boolean(stream) &&
    (participant.videoEnabled || participant.screenSharing) &&
    stream!.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled);

  useEffect(() => {
    if (videoRef.current && stream && hasLiveVideo) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, hasLiveVideo]);

  useEffect(() => {
    if (audioRef.current && stream && !isSelf) {
      audioRef.current.srcObject = stream;
    }
  }, [stream, isSelf]);

  return (
    <div
      className={`relative rounded-2xl overflow-hidden bg-[#172230] border border-white/10 flex flex-col items-center justify-center ${
        isCompact ? 'min-h-[190px]' : 'min-h-[260px]'
      }`}
    >
      {/* Always attach remote audio playback even when video is off */}
      {!isSelf && stream && <audio ref={audioRef} autoPlay playsInline />}

      {hasLiveVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isSelf}
          className={`w-full h-full object-cover ${
            isSelf && !participant.screenSharing ? '-scale-x-100' : ''
          }`}
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 p-6">
          <div className="rounded-full p-1 ring-2 ring-[#3390EC]/40">
            <Avatar
              title={participant.name}
              avatarUrl={participant.avatarUrl}
              avatarColor={participant.avatarColor}
              size="xl"
            />
          </div>
          <div className="text-center">
            <div className="font-display font-semibold text-sm text-white">
              {participant.name}
              {isSelf ? ' (Вы)' : ''}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {participant.username}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Name & Media State Scrim */}
      <div className="absolute inset-x-0 bottom-0 px-3 py-2 bg-gradient-to-t from-black/75 via-black/35 to-transparent flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-white truncate">
          {participant.name}
          {isSelf ? ' (Вы)' : ''}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {participant.screenSharing && (
            <span
              title="Демонстрация экрана"
              className="w-6 h-6 rounded-full bg-[#3390EC]/90 text-white flex items-center justify-center"
            >
              <Monitor className="w-3.5 h-3.5" />
            </span>
          )}
          <span
            title={participant.micMuted ? 'Микрофон выключен' : 'Микрофон включён'}
            className={`w-6 h-6 rounded-full flex items-center justify-center ${
              participant.micMuted
                ? 'bg-rose-500/90 text-white'
                : 'bg-black/45 text-emerald-300'
            }`}
          >
            {participant.micMuted ? (
              <MicOff className="w-3.5 h-3.5" />
            ) : (
              <Mic className="w-3.5 h-3.5" />
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

export function CallOverlay({ call, currentUserId }: CallOverlayProps) {
  const {
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
    acceptIncomingCall,
    declineIncomingCall,
    hangUp,
    toggleMic,
    toggleVideo,
    toggleScreenShare,
  } = call;

  // Temporary call notice banner (e.g. "Звонок отклонён")
  if (!joinedCall && !incomingCall && callNotice) {
    return (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] px-4 py-2.5 rounded-xl bg-[#17212B] text-slate-100 text-sm font-medium shadow-xl border border-[#2B3B4E]">
        {callNotice}
      </div>
    );
  }

  // Incoming Call Card
  if (incomingCall && !joinedCall) {
    const isGroup = incomingCall.chatType === 'group';
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Входящий звонок"
          className="w-full max-w-sm rounded-3xl bg-[#141E2B] text-white border border-white/10 shadow-2xl p-7 text-center"
        >
          <div className="flex justify-center">
            <div className="rounded-full p-1.5 ring-4 ring-emerald-500/35">
              <Avatar
                title={incomingCall.chatTitle}
                avatarColor="#3390EC"
                type={isGroup ? 'group' : 'private'}
                size="xl"
              />
            </div>
          </div>

          <h2 className="font-display font-bold text-xl mt-4 truncate">
            {incomingCall.chatTitle}
          </h2>
          <p className="text-sm text-slate-300 mt-1">
            {isGroup
              ? `Групповой звонок · ${incomingCall.initiatorName}`
              : incomingCall.mode === 'video'
                ? 'Входящий видеозвонок (P2P)'
                : 'Входящий аудиозвонок (P2P)'}
          </p>

          <div className="mt-8 flex items-center justify-center gap-6">
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={declineIncomingCall}
                aria-label="Отклонить звонок"
                className="w-14 h-14 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
              <span className="text-xs text-slate-400">Отклонить</span>
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => void acceptIncomingCall('audio')}
                aria-label="Принять аудиозвонок"
                className="w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer"
              >
                <Phone className="w-6 h-6" />
              </button>
              <span className="text-xs text-slate-400">Ответить</span>
            </div>

            {incomingCall.mode === 'video' && (
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void acceptIncomingCall('video')}
                  aria-label="Принять с видео"
                  className="w-14 h-14 rounded-full bg-[#3390EC] hover:opacity-95 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer"
                >
                  <Video className="w-6 h-6" />
                </button>
                <span className="text-xs text-slate-400">С видео</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!joinedCall) return null;

  const isGroup = joinedCall.chatType === 'group';
  const participantCount = joinedCall.participants.length;

  // Minimized Floating Call Bar (so user can keep messaging during call)
  if (minimized) {
    return (
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[70] w-[420px] max-w-[calc(100vw-24px)] rounded-2xl bg-[#17212B]/98 text-white border border-emerald-500/35 shadow-2xl px-4 py-2.5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
        >
          <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            {isGroup ? <Users className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">
              {joinedCall.chatTitle}
            </div>
            <div className="text-xs text-emerald-400 tabular-nums">
              {participantCount > 1
                ? `${formatCallElapsed(elapsedSec)} · ${participantCount} уч.`
                : 'Ожидание подключения...'}
            </div>
          </div>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={toggleMic}
            aria-label={micMuted ? 'Включить микрофон' : 'Выключить микрофон'}
            className={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer ${
              micMuted
                ? 'bg-rose-500/20 text-rose-400'
                : 'bg-white/10 hover:bg-white/15 text-white'
            }`}
          >
            {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => setMinimized(false)}
            aria-label="Развернуть окно звонка"
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/15 text-white flex items-center justify-center cursor-pointer"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={hangUp}
            aria-label="Завершить звонок"
            className="w-9 h-9 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center cursor-pointer"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const gridCols =
    participantCount <= 1
      ? 'grid-cols-1 max-w-md mx-auto'
      : participantCount === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : participantCount <= 4
          ? 'grid-cols-2'
          : 'grid-cols-2 md:grid-cols-3';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-0 sm:p-6 bg-black/75 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Звонок: ${joinedCall.chatTitle}`}
        className="w-full max-w-4xl h-[100dvh] sm:h-[86vh] sm:max-h-[720px] rounded-none sm:rounded-3xl bg-[#0F1722] text-white border-0 sm:border border-white/10 shadow-2xl flex flex-col overflow-hidden pt-safe pb-safe"
      >
        {/* Call Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="font-display font-bold text-base sm:text-lg truncate">
              {joinedCall.chatTitle}
            </h2>
            <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5 tabular-nums">
              <span>{isGroup ? 'Групповой звонок WebRTC' : 'Личный звонок P2P'}</span>
              <span aria-hidden="true">·</span>
              <span>
                {participantCount > 1
                  ? `${participantCount} участн. · ${formatCallElapsed(elapsedSec)}`
                  : 'Вызов собеседника...'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMinimized(true)}
            aria-label="Свернуть окно звонка"
            className="px-3 py-2 rounded-xl bg-white/8 hover:bg-white/14 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Minimize2 className="w-4 h-4" />
            <span className="hidden sm:inline">Свернуть</span>
          </button>
        </div>

        {/* Optional Hardware / Permission Warning */}
        {mediaWarning && (
          <div className="px-5 py-2.5 bg-amber-500/15 border-b border-amber-500/25 text-xs text-amber-200">
            {mediaWarning}
          </div>
        )}

        {/* Participants Grid */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 flex items-center justify-center">
          <div className={`w-full grid gap-3 ${gridCols}`}>
            {joinedCall.participants.map((p) => {
              const isSelf = p.userId === currentUserId;
              const stream = isSelf
                ? localStream
                : remoteStreams[p.userId] ?? null;
              return (
                <StreamMediaTile
                  key={p.userId}
                  participant={
                    isSelf
                      ? { ...p, micMuted, videoEnabled, screenSharing }
                      : p
                  }
                  stream={stream}
                  isSelf={isSelf}
                  isCompact={participantCount > 2}
                />
              );
            })}
          </div>
        </div>

        {/* Bottom Controls Dock */}
        <div className="px-5 py-4 border-t border-white/10 bg-[#131E2C] flex items-center justify-center gap-3 sm:gap-4 shrink-0">
          <button
            type="button"
            onClick={toggleMic}
            aria-label={micMuted ? 'Включить микрофон' : 'Выключить микрофон'}
            className={`h-12 px-4 rounded-2xl flex items-center gap-2 text-xs font-semibold transition-colors cursor-pointer ${
              micMuted
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'bg-white/10 hover:bg-white/16 text-white'
            }`}
          >
            {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            <span className="hidden sm:inline">
              {micMuted ? 'Микрофон выкл.' : 'Микрофон'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void toggleVideo()}
            aria-label={videoEnabled ? 'Выключить камеру' : 'Включить камеру'}
            className={`h-12 px-4 rounded-2xl flex items-center gap-2 text-xs font-semibold transition-colors cursor-pointer ${
              videoEnabled
                ? 'bg-[#3390EC] text-white'
                : 'bg-white/10 hover:bg-white/16 text-white'
            }`}
          >
            {videoEnabled ? (
              <Video className="w-5 h-5" />
            ) : (
              <VideoOff className="w-5 h-5" />
            )}
            <span className="hidden sm:inline">
              {videoEnabled ? 'Камера вкл.' : 'Камера'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void toggleScreenShare()}
            aria-label={
              screenSharing ? 'Остановить показ экрана' : 'Показать экран'
            }
            className={`h-12 px-4 rounded-2xl flex items-center gap-2 text-xs font-semibold transition-colors cursor-pointer ${
              screenSharing
                ? 'bg-emerald-500 text-white'
                : 'bg-white/10 hover:bg-white/16 text-white'
            }`}
          >
            {screenSharing ? (
              <MonitorOff className="w-5 h-5" />
            ) : (
              <Monitor className="w-5 h-5" />
            )}
            <span className="hidden sm:inline">
              {screenSharing ? 'Стоп экран' : 'Экран'}
            </span>
          </button>

          <button
            type="button"
            onClick={hangUp}
            aria-label="Завершить звонок"
            className="h-12 px-5 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white flex items-center gap-2 text-xs font-semibold shadow-lg cursor-pointer"
          >
            <PhoneOff className="w-5 h-5" />
            <span>Завершить</span>
          </button>
        </div>
      </div>
    </div>
  );
}
