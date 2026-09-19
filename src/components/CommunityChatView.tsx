import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  MapPin, 
  Tag, 
  Image as ImageIcon, 
  Radio, 
  Shield, 
  Users, 
  Search, 
  AlertTriangle, 
  CheckCheck, 
  LogIn, 
  Lock, 
  Volume2, 
  RefreshCw,
  Sparkles,
  ExternalLink,
  ChevronDown,
  Paperclip,
  FileText,
  Mic,
  Eye,
  Download,
  X,
  Camera,
  Loader2,
  Phone,
  Video,
  PhoneCall,
  PhoneOff,
  PhoneIncoming,
  BellRing,
  UserPlus
} from 'lucide-react';
import { 
  DiraMessage, 
  ChatChannel, 
  UserProfile, 
  UserRole,
  DonkeyCase, 
  VoiceNoteAttachment, 
  MediaAttachment,
  ActiveCallSession,
  CallType
} from '../types';
import { 
  getAllMessagesFromDb, 
  saveMessageToDb, 
  subscribeToFirestoreMessages, 
  subscribeToChatMessageBroadcast,
  getAllUsersFromDb
} from '../services/db';
import { playMessagePopSound } from '../services/notificationService';
import { VoiceNotePlayer } from './VoiceNotePlayer';
import { VoiceNoteRecorder } from './VoiceNoteRecorder';
import { PhotoLightboxModal } from './PhotoLightboxModal';
import { compressImageFile, fileToBase64, formatBytes, downloadFile } from '../utils/attachmentUtils';
import { callService } from '../services/callService';
import { StartCallModal } from './StartCallModal';

export const CHANNELS: ChatChannel[] = [
  {
    id: 'general',
    name: 'Wanajamii Alerts',
    description: 'General community news, donkey welfare notices, and local alerts',
    iconName: 'users',
    badge: 'Open',
  },
  {
    id: 'rescue',
    name: 'Search & Rescue',
    description: 'Active tracking operations, missing donkey sweeps, and patrol updates',
    iconName: 'alert',
    badge: 'Urgent',
  },
  {
    id: 'sightings',
    name: 'Donkey Sightings',
    description: 'Reported sightings of unattended, stray, or suspicious livestock movements',
    iconName: 'search',
    badge: 'Field',
  },
  {
    id: 'officers',
    name: 'Officers & Vets',
    description: 'Coordination channel for Caritas officers, police liaisons, and vets',
    iconName: 'shield',
    requiresOfficerRole: true,
    badge: 'Protected',
  },
];

interface CommunityChatViewProps {
  currentUser: UserProfile | null;
  cases: DonkeyCase[];
  allUsers?: UserProfile[];
  onOpenAuthModal: () => void;
  onSelectCase?: (caseItem: DonkeyCase) => void;
  initialChannelId?: string;
}

export const CommunityChatView: React.FC<CommunityChatViewProps> = ({
  currentUser,
  cases,
  allUsers,
  onOpenAuthModal,
  onSelectCase,
  initialChannelId = 'general',
}) => {
  const [activeChannelId, setActiveChannelId] = useState<string>(initialChannelId || 'general');

  useEffect(() => {
    if (initialChannelId && CHANNELS.some(c => c.id === initialChannelId)) {
      setActiveChannelId(initialChannelId);
    }
  }, [initialChannelId]);
  const [messages, setMessages] = useState<DiraMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedCaseTag, setSelectedCaseTag] = useState<string>('');
  const [showCasePicker, setShowCasePicker] = useState(false);
  const [attachingLocation, setAttachingLocation] = useState(false);
  const [attachedLocation, setAttachedLocation] = useState<{ latitude: number; longitude: number; name?: string } | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // User list for direct 1-on-1 calls
  const [userList, setUserList] = useState<UserProfile[]>(allUsers || []);

  useEffect(() => {
    if (allUsers && allUsers.length > 0) {
      setUserList(allUsers);
    } else {
      getAllUsersFromDb().then((users) => {
        if (users && users.length > 0) setUserList(users);
      }).catch(() => {});
    }
  }, [allUsers]);

  // Voice & Video Call State
  const [activeCall, setActiveCall] = useState<ActiveCallSession | null>(null);
  const [incomingCall, setIncomingCall] = useState<ActiveCallSession | null>(null);
  const [isStartCallModalOpen, setIsStartCallModalOpen] = useState(false);
  const [channelActiveCalls, setChannelActiveCalls] = useState<ActiveCallSession[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);

  // Voice Note & Attachments State
  const [isRecordingVoiceNote, setIsRecordingVoiceNote] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<MediaAttachment | null>(null);
  const [isProcessingAttachment, setIsProcessingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    fileName?: string;
    senderName?: string;
    caption?: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const currentChannel = CHANNELS.find(c => c.id === activeChannelId) || CHANNELS[0];

  // Guest user identity support (allows immediate chat participation without login barriers)
  const [guestName, setGuestName] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('dira_guest_name') || 'Community Member (Kitui)';
    }
    return 'Community Member (Kitui)';
  });
  const [isEditingGuestName, setIsEditingGuestName] = useState(false);
  const [tempGuestName, setTempGuestName] = useState('');

  const getGuestSenderId = () => {
    if (typeof window !== 'undefined') {
      let gid = localStorage.getItem('dira_guest_sender_id');
      if (!gid) {
        gid = `guest-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
        localStorage.setItem('dira_guest_sender_id', gid);
      }
      return gid;
    }
    return 'guest-user';
  };

  // Setup Call Presence & Listeners
  useEffect(() => {
    const effectiveUserId = currentUser?.id || (currentUser?.phone ? `phone-${currentUser.phone}` : getGuestSenderId());
    const effectiveName = currentUser?.name || guestName;
    callService.setCurrentUser(effectiveUserId, effectiveName, currentUser?.role, currentUser?.phone);

    const unsubCallState = callService.onCallState(setActiveCall);
    const unsubIncoming = callService.onIncomingCall((call) => {
      setIncomingCall(call);
    });
    const unsubActiveCalls = callService.onActiveCallsList(setChannelActiveCalls);

    const refreshPresenceAndCalls = () => {
      callService.fetchActiveCalls().then(setChannelActiveCalls).catch(() => {});
      callService.fetchOnlineUsers().then((users) => {
        setOnlineUserIds(users.map(u => u.id));
      }).catch(() => {});
    };

    refreshPresenceAndCalls();
    const pollInterval = setInterval(refreshPresenceAndCalls, 8000);

    return () => {
      unsubCallState();
      unsubIncoming();
      unsubActiveCalls();
      clearInterval(pollInterval);
    };
  }, [currentUser, guestName]);

  const [isTestingCall, setIsTestingCall] = useState(false);
  const [testCallNotice, setTestCallNotice] = useState<string | null>(null);

  const handleTriggerTestCall = (type: CallType = 'video') => {
    setIsTestingCall(true);
    setTestCallNotice('Simulating incoming call in 2 seconds... Prepare to answer!');
    setTimeout(() => {
      callService.simulateIncomingCall({
        callType: type,
        isGroup: false,
        callerName: 'Senior Officer Peter Kiprotich',
        callerRole: 'chief_officer',
        callerPhone: '0711999888',
        callerSubCounty: 'Kitui Central Command HQ',
      });
      setIsTestingCall(false);
      setTestCallNotice(null);
    }, 2000);
  };

  const handleStartGroupCall = async (channel: ChatChannel, callType: CallType) => {
    const effectiveUserId = currentUser?.id || (currentUser?.phone ? `phone-${currentUser.phone}` : getGuestSenderId());
    const effectiveName = currentUser?.name || guestName;

    try {
      const session = await callService.startCall({
        channelId: channel.id,
        channelName: channel.name,
        callType,
        isGroup: true,
        initiator: {
          id: effectiveUserId,
          name: effectiveName,
          role: currentUser?.role,
          phone: currentUser?.phone,
          subCounty: currentUser?.subCounty,
        },
      });

      const callMsg: DiraMessage = {
        id: `call-msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        senderId: effectiveUserId,
        senderName: effectiveName,
        senderPhone: currentUser?.phone,
        senderRole: (currentUser?.role as UserRole) || 'primary_user',
        senderSubCounty: currentUser?.subCounty,
        channelId: channel.id,
        content: `📞 Started a group ${callType} call in #${channel.name}`,
        timestamp: new Date().toISOString(),
        callInfo: {
          callId: session.callId,
          callType,
          status: 'calling',
          isGroup: true,
        },
        delivered: true,
      };
      saveMessageToDb(callMsg).catch(() => {});
    } catch (err) {
      console.warn('Start group call notice:', err);
    }
  };

  const handleStartDirectCall = async (
    targetUser: UserProfile, 
    callType: CallType, 
    targetDeviceId?: string, 
    targetDeviceName?: string
  ) => {
    const effectiveUserId = currentUser?.id || (currentUser?.phone ? `phone-${currentUser.phone}` : getGuestSenderId());
    const effectiveName = currentUser?.name || guestName;

    try {
      const session = await callService.startCall({
        callType,
        isGroup: false,
        initiator: {
          id: effectiveUserId,
          name: effectiveName,
          role: currentUser?.role,
          phone: currentUser?.phone,
          subCounty: currentUser?.subCounty,
        },
        targetUser: {
          id: targetUser.id,
          name: targetUser.name,
          phone: targetUser.phone,
          role: targetUser.role,
        },
        targetDeviceId: targetDeviceId || (targetUser as any).deviceId,
        targetDeviceName: targetDeviceName || (targetUser as any).deviceName || (targetUser as any).deviceModel,
      });

      const callMsg: DiraMessage = {
        id: `call-msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        senderId: effectiveUserId,
        senderName: effectiveName,
        senderPhone: currentUser?.phone,
        senderRole: (currentUser?.role as UserRole) || 'primary_user',
        senderSubCounty: currentUser?.subCounty,
        channelId: activeChannelId,
        content: `📞 Calling ${targetUser.name} (${callType} call)`,
        timestamp: new Date().toISOString(),
        callInfo: {
          callId: session.callId,
          callType,
          status: 'calling',
          isGroup: false,
          targetUserName: targetUser.name,
        },
        delivered: true,
      };
      saveMessageToDb(callMsg).catch(() => {});
    } catch (err) {
      console.warn('Start direct call notice:', err);
    }
  };

  const handleAcceptIncomingCall = (call: ActiveCallSession) => {
    setIncomingCall(null);
    if (call.isGroup) {
      callService.joinGroupCall(call);
    } else {
      callService.answerCall(call);
    }
  };

  const handleDeclineIncomingCall = (callId: string) => {
    setIncomingCall(null);
    callService.rejectCall(callId);
  };

  const handleEndActiveCall = () => {
    callService.endCall();
    setActiveCall(null);
  };

  // Find if current channel has an active group call
  const currentChannelCall = channelActiveCalls.find(
    c => c.channelId === activeChannelId && c.isGroup && c.status !== 'ended' && c.status !== 'rejected'
  );

  // Scroll to bottom smoothly
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Load messages from local DB & subscribe to Firestore
  useEffect(() => {
    let isMounted = true;
    setIsSyncing(true);

    // 1. Initial load from local DB
    getAllMessagesFromDb(activeChannelId).then((initial) => {
      if (isMounted) {
        setMessages(initial);
        setIsSyncing(false);
        setTimeout(() => scrollToBottom('auto'), 100);
      }
    });

    // 2. Real-time Firestore sync
    const unsubscribeFirestore = subscribeToFirestoreMessages(activeChannelId, (cloudMsgs) => {
      if (!isMounted) return;
      setMessages((prev) => {
        const map = new Map<string, DiraMessage>();
        prev.forEach(m => map.set(m.id, m));
        cloudMsgs.forEach(m => {
          // If message is new and not sent by current user, play subtle pop
          if (!map.has(m.id) && m.senderId !== currentUser?.id && soundEnabled) {
            playMessagePopSound();
          }
          map.set(m.id, m);
        });
        const merged = Array.from(map.values()).sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        return merged;
      });
      setTimeout(() => scrollToBottom('smooth'), 150);
    });

    // 3. Real-time Cross-tab broadcast
    const unsubscribeBroadcast = subscribeToChatMessageBroadcast((incomingMsg) => {
      if (!isMounted) return;
      if (incomingMsg.channelId === activeChannelId) {
        setMessages((prev) => {
          if (prev.some(m => m.id === incomingMsg.id)) return prev;
          if (incomingMsg.senderId !== currentUser?.id && soundEnabled) {
            playMessagePopSound();
          }
          return [...prev, incomingMsg];
        });
        setTimeout(() => scrollToBottom('smooth'), 150);
      }
    });

    return () => {
      isMounted = false;
      unsubscribeFirestore();
      unsubscribeBroadcast();
    };
  }, [activeChannelId, currentUser?.id, soundEnabled]);

  // Handle Send Voice Note
  const handleVoiceNoteSend = async (voiceNote: VoiceNoteAttachment) => {
    setIsRecordingVoiceNote(false);
    setIsSending(true);

    const trimmed = inputText.trim();
    const senderId = currentUser?.id || (currentUser?.phone ? `phone-${currentUser.phone}` : getGuestSenderId());
    const senderName = currentUser?.name || guestName || 'Community Member';
    const senderPhone = currentUser?.phone;
    const senderRole = currentUser?.role || 'reporter';
    const senderSubCounty = currentUser?.subCounty || 'Kitui';

    const newMsg: DiraMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      senderId,
      senderName,
      senderPhone,
      senderRole,
      senderSubCounty,
      channelId: activeChannelId,
      content: trimmed || `🎤 Voice Note (${voiceNote.durationSeconds}s)`,
      timestamp: new Date().toISOString(),
      caseTrackingCode: selectedCaseTag || undefined,
      location: attachedLocation || undefined,
      voiceNote,
      delivered: true,
    };

    setMessages(prev => [...prev, newMsg]);
    setInputText('');
    setSelectedCaseTag('');
    setAttachedLocation(null);
    setTimeout(() => scrollToBottom('smooth'), 50);

    try {
      await saveMessageToDb(newMsg);
    } catch (err) {
      console.warn('Failed to save voice note:', err);
    } finally {
      setIsSending(false);
    }
  };

  // Handle Photo Selection
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setAttachmentError(null);

    try {
      setIsProcessingAttachment(true);
      const dataUrl = await compressImageFile(file);
      setPendingAttachment({
        type: 'image',
        url: dataUrl,
        fileName: file.name,
        fileSizeFormatted: formatBytes(file.size),
        fileSizeBytes: file.size,
        mimeType: file.type || 'image/jpeg',
      });
    } catch (err: any) {
      console.error('Failed to compress image:', err);
      setAttachmentError('Could not process photo. Please try a different image.');
    } finally {
      setIsProcessingAttachment(false);
    }
  };

  // Handle Document Selection (.pdf, .doc, .docx, .txt, etc.)
  const handleDocSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setAttachmentError(null);

    // Guard against excessively large documents (> 2.5 MB)
    if (file.size > 2.5 * 1024 * 1024) {
      setAttachmentError(`File "${file.name}" is ${formatBytes(file.size)}. Please select a document smaller than 2.5 MB for instant mobile delivery.`);
      return;
    }

    try {
      setIsProcessingAttachment(true);
      const dataUrl = await fileToBase64(file);
      setPendingAttachment({
        type: 'document',
        url: dataUrl,
        fileName: file.name,
        fileSizeFormatted: formatBytes(file.size),
        fileSizeBytes: file.size,
        mimeType: file.type || 'application/octet-stream',
      });
    } catch (err: any) {
      console.error('Failed to process document:', err);
      setAttachmentError('Could not read document. Please try again.');
    } finally {
      setIsProcessingAttachment(false);
    }
  };

  // Handle Send Regular / Attachment Message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const trimmed = inputText.trim();
    if (!trimmed && !attachedLocation && !pendingAttachment) return;

    setIsSending(true);

    const defaultContent = pendingAttachment
      ? trimmed || (pendingAttachment.type === 'image' ? '📷 Photo attached' : `📄 ${pendingAttachment.fileName}`)
      : trimmed;

    const senderId = currentUser?.id || (currentUser?.phone ? `phone-${currentUser.phone}` : getGuestSenderId());
    const senderName = currentUser?.name || guestName || 'Community Member';
    const senderPhone = currentUser?.phone;
    const senderRole = currentUser?.role || 'reporter';
    const senderSubCounty = currentUser?.subCounty || 'Kitui';

    const newMsg: DiraMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      senderId,
      senderName,
      senderPhone,
      senderRole,
      senderSubCounty,
      channelId: activeChannelId,
      content: defaultContent,
      timestamp: new Date().toISOString(),
      caseTrackingCode: selectedCaseTag || undefined,
      location: attachedLocation || undefined,
      mediaAttachment: pendingAttachment || undefined,
      delivered: true,
    };

    // Optimistic UI update
    setMessages(prev => [...prev, newMsg]);
    setInputText('');
    setSelectedCaseTag('');
    setAttachedLocation(null);
    setPendingAttachment(null);
    setShowCasePicker(false);
    setAttachmentError(null);
    setTimeout(() => scrollToBottom('smooth'), 50);

    try {
      await saveMessageToDb(newMsg);
    } catch (err) {
      console.warn('Failed to save message:', err);
    } finally {
      setIsSending(false);
    }
  };

  // Attach GPS location
  const handleAttachLocation = () => {
    if (attachedLocation) {
      setAttachedLocation(null);
      return;
    }
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setAttachingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setAttachedLocation({
          latitude: Number(pos.coords.latitude.toFixed(5)),
          longitude: Number(pos.coords.longitude.toFixed(5)),
          name: currentUser?.subCounty ? `${currentUser.subCounty} GPS` : 'Current Position',
        });
        setAttachingLocation(false);
      },
      (err) => {
        console.warn('GPS error:', err);
        // Fallback default Kitui center
        setAttachedLocation({
          latitude: -1.368,
          longitude: 38.010,
          name: 'Kitui Central Coordinate',
        });
        setAttachingLocation(false);
      },
      { timeout: 8000 }
    );
  };

  // Helper to format role badge
  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'chief_officer':
      case 'super_user':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-red-100 text-red-800 border border-red-200">Super User</span>;
      case 'field_officer':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">Field Officer</span>;
      case 'veterinary_officer':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">Veterinary</span>;
      case 'village_elder':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">Village Elder</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-zinc-100 text-zinc-700 border border-zinc-200">Reporter</span>;
    }
  };

  // Helper to format message time
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // Check if current user is allowed in this channel
  const isChannelRestricted = Boolean(
    currentChannel.requiresOfficerRole && 
    (!currentUser || !['field_officer', 'chief_officer', 'veterinary_officer', 'super_user'].includes(currentUser.role))
  );

  return (
    <div className="w-full max-w-4xl mx-auto flex-1 flex flex-col min-h-0 space-y-2 h-full overflow-hidden">
      {/* Top Banner / Channels Bar */}
      <div className="bg-white rounded-2xl p-2 sm:p-2.5 border border-zinc-200 shadow-xs shrink-0">
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-950 text-emerald-400 flex items-center justify-center shadow-xs shrink-0">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-black text-zinc-900 font-display tracking-tight">
                  DIRA Community Messenger
                </h2>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Live Sync
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 truncate max-w-[210px] sm:max-w-md">
                Donkey welfare, rescue & coordinate alerts across Kitui
              </p>
            </div>
          </div>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border shrink-0 ${
              soundEnabled
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-zinc-100 border-zinc-200 text-zinc-500'
            }`}
            title={soundEnabled ? 'Incoming message sound ON' : 'Incoming message sound OFF'}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[11px]">{soundEnabled ? 'Sound ON' : 'Muted'}</span>
          </button>
        </div>

        {/* Channel Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2 pb-0.5 no-scrollbar">
          {CHANNELS.map((ch) => {
            const isActive = ch.id === activeChannelId;
            return (
              <button
                key={ch.id}
                onClick={() => setActiveChannelId(ch.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border shrink-0 touch-manipulation ${
                  isActive
                    ? 'bg-emerald-900 text-white border-emerald-950 shadow-xs'
                    : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                }`}
              >
                {ch.id === 'general' && <Users className="w-3.5 h-3.5" />}
                {ch.id === 'rescue' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                {ch.id === 'sightings' && <Search className="w-3.5 h-3.5 text-cyan-400" />}
                {ch.id === 'officers' && <Shield className="w-3.5 h-3.5 text-red-400" />}
                <span>#{ch.name}</span>
                <span className={`text-[9px] px-1.5 py-0.2 rounded-full ${
                  isActive ? 'bg-emerald-800 text-emerald-100' : 'bg-zinc-200 text-zinc-600'
                }`}>
                  {ch.badge}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Chat Body Card - Flexes smoothly to fit available viewport */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-zinc-200 shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Channel Info Header */}
        <div className="px-3.5 py-2 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-zinc-900 shrink-0">#{currentChannel.name}</span>
            <span className="text-zinc-400 shrink-0">•</span>
            <span className="text-zinc-500 truncate max-w-[130px] sm:max-w-xs text-[11px]">
              {currentChannel.description}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Start Group Call or Select User to Call */}
            <button
              onClick={() => setIsStartCallModalOpen(true)}
              className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
              title="Start Voice/Video Group Call or Select User to Call"
            >
              <Video className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Group Call</span>
            </button>

            <button
              onClick={() => setIsStartCallModalOpen(true)}
              className="p-1 sm:px-2.5 sm:py-1 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs flex items-center gap-1 transition-all border border-zinc-200 cursor-pointer"
              title="Select User to Call (Direct 1-on-1)"
            >
              <Phone className="w-3.5 h-3.5 text-emerald-700" />
              <span className="hidden md:inline text-[11px]">Direct Call</span>
            </button>

            {/* Test Call Receiver simulation button */}
            <button
              onClick={() => handleTriggerTestCall('video')}
              disabled={isTestingCall}
              className="px-2 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              title="Simulate receiving an incoming call inside chat to test audio, ringing, and answering"
            >
              <BellRing className={`w-3.5 h-3.5 text-amber-700 ${isTestingCall ? 'animate-bounce' : ''}`} />
              <span className="hidden lg:inline text-[11px]">
                {isTestingCall ? 'Ringing...' : 'Test Receive Call'}
              </span>
              <span className="lg:hidden text-[11px]">Test</span>
            </button>

            <span className="text-[10px] font-medium text-zinc-400 pl-1">
              {messages.length} msgs
            </span>
          </div>
        </div>

        {/* Test Call Receiver Countdown Notice */}
        {testCallNotice && (
          <div className="bg-amber-500 text-amber-950 px-3.5 py-1.5 text-xs font-bold border-b border-amber-600 flex items-center justify-between gap-2 animate-fadeIn">
            <div className="flex items-center gap-2">
              <BellRing className="w-4 h-4 animate-spin text-amber-950" />
              <span>{testCallNotice}</span>
            </div>
            <span className="text-[10px] bg-amber-900 text-amber-100 px-2 py-0.5 rounded-full font-mono">
              2s Countdown
            </span>
          </div>
        )}

        {/* In-Chat Incoming Call Ringing Card */}
        {incomingCall && (
          <div className="bg-gradient-to-r from-emerald-950 via-zinc-900 to-emerald-950 text-white p-3 border-b-2 border-emerald-400 flex flex-col sm:flex-row items-center justify-between gap-3 animate-fadeIn shadow-xl ring-2 ring-emerald-500/20">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative shrink-0">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-emerald-600 to-emerald-800 flex items-center justify-center font-bold text-lg text-white shadow-md">
                  {incomingCall.isGroup ? <Users className="w-6 h-6" /> : (incomingCall.initiator.name[0] || 'C').toUpperCase()}
                </div>
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-zinc-950 animate-ping" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                    <PhoneIncoming className="w-3 h-3 animate-bounce text-emerald-400" />
                    {incomingCall.isGroup
                      ? `Incoming Group ${incomingCall.callType === 'video' ? 'Video' : 'Voice'} Call`
                      : `Incoming 1-on-1 ${incomingCall.callType === 'video' ? 'Video' : 'Voice'} Call`
                    }
                  </span>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.2 rounded-full animate-pulse">
                    Ringing In Chat...
                  </span>
                </div>
                <div className="text-sm font-black truncate text-white">
                  {incomingCall.isGroup ? `#${incomingCall.channelName || currentChannel.name}` : incomingCall.initiator.name}
                </div>
                <div className="text-[11px] text-zinc-300 truncate">
                  {incomingCall.isGroup 
                    ? `Initiated by ${incomingCall.initiator.name}`
                    : (incomingCall.initiator.role ? `${incomingCall.initiator.role.replace('_', ' ')} • ${incomingCall.initiator.subCounty || 'Kitui'}` : 'Community Member')
                  }
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
              <button
                onClick={() => handleDeclineIncomingCall(incomingCall.callId)}
                className="flex-1 sm:flex-none px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer"
                title="Decline Call"
              >
                <PhoneOff className="w-3.5 h-3.5" />
                <span>Decline</span>
              </button>
              <button
                onClick={() => handleAcceptIncomingCall(incomingCall)}
                className="flex-1 sm:flex-none px-4 py-1.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-zinc-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer ring-2 ring-emerald-300"
                title="Answer Call within Chat"
              >
                {incomingCall.callType === 'video' ? <Video className="w-3.5 h-3.5 text-zinc-950" /> : <Phone className="w-3.5 h-3.5 text-zinc-950" />}
                <span>Answer {incomingCall.callType === 'video' ? 'Video' : 'Voice'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Active Group Call in Progress Ribbon */}
        {currentChannelCall && (
          <div className="bg-gradient-to-r from-emerald-900 to-emerald-950 text-white px-3.5 py-2 border-b border-emerald-800 flex items-center justify-between gap-2 text-xs animate-fadeIn">
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="font-bold truncate text-emerald-200">
                Active Group Call in #{currentChannel.name}
              </span>
              <span className="text-[11px] text-emerald-300 font-medium hidden sm:inline">
                ({currentChannelCall.participants.length} connected)
              </span>
            </div>

            <button
              onClick={() => callService.joinGroupCall(currentChannelCall)}
              className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer shrink-0"
            >
              {currentChannelCall.callType === 'video' ? (
                <Video className="w-3.5 h-3.5 text-zinc-950" />
              ) : (
                <Phone className="w-3.5 h-3.5 text-zinc-950" />
              )}
              <span>Join Call</span>
            </button>
          </div>
        )}

        {/* Messages Feed */}
        <div className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-3 bg-zinc-50/40">
          {/* Welcome Message in Feed */}
          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3 text-center text-xs text-emerald-900 space-y-1">
            <span className="font-bold block text-[11px] uppercase tracking-wider text-emerald-800">
              Welcome to #{currentChannel.name}
            </span>
            <p className="text-[11px] text-emerald-700 max-w-md mx-auto">
              This channel is encrypted and synchronized with community responders across Kitui County.
              Keep communications focused on donkey welfare, rescue coordination, and incident tracking.
            </p>
          </div>

          {messages.map((msg) => {
            const isMe = Boolean(
              currentUser && (msg.senderId === currentUser.id || (currentUser.phone && msg.senderPhone === currentUser.phone))
            );

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                {/* Sender metadata (only for incoming messages) */}
                {!isMe && (
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className="text-xs font-bold text-zinc-800">{msg.senderName}</span>
                    {getRoleBadge(msg.senderRole)}
                    {msg.senderSubCounty && (
                      <span className="text-[10px] text-zinc-400 font-medium">
                        {msg.senderSubCounty}
                      </span>
                    )}
                    {/* Quick Call Sender Action Buttons */}
                    <div className="flex items-center gap-0.5 ml-1">
                      <button
                        onClick={() => handleStartDirectCall({
                          id: msg.senderId,
                          name: msg.senderName,
                          phone: msg.senderPhone || '',
                          role: (msg.senderRole as UserRole) || 'primary_user',
                          subCounty: msg.senderSubCounty,
                        }, 'audio')}
                        className="p-1 text-zinc-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                        title={`Voice Call ${msg.senderName}`}
                      >
                        <Phone className="w-3 h-3 text-emerald-700" />
                      </button>
                      <button
                        onClick={() => handleStartDirectCall({
                          id: msg.senderId,
                          name: msg.senderName,
                          phone: msg.senderPhone || '',
                          role: (msg.senderRole as UserRole) || 'primary_user',
                          subCounty: msg.senderSubCounty,
                        }, 'video')}
                        className="p-1 text-zinc-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                        title={`Video Call ${msg.senderName}`}
                      >
                        <Video className="w-3 h-3 text-emerald-600" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Message Bubble */}
                <div
                  className={`max-w-[85%] sm:max-w-[70%] rounded-2xl p-3 text-xs shadow-2xs space-y-1.5 ${
                    isMe
                      ? 'bg-emerald-800 text-white rounded-tr-xs'
                      : 'bg-white text-zinc-900 border border-zinc-200 rounded-tl-xs'
                  }`}
                >
                  {/* Linked Case Tag if present */}
                  {msg.caseTrackingCode && (
                    <div
                      onClick={() => {
                        const targetCase = cases.find(c => c.trackingCode === msg.caseTrackingCode);
                        if (targetCase && onSelectCase) {
                          onSelectCase(targetCase);
                        }
                      }}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer transition-all border ${
                        isMe
                          ? 'bg-emerald-950/60 text-emerald-200 border-emerald-700/60 hover:bg-emerald-900'
                          : 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100'
                      }`}
                    >
                      <Tag className="w-3 h-3" />
                      <span>{msg.caseTrackingCode}</span>
                      <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                    </div>
                  )}

                  {/* Attached GPS Location pill */}
                  {msg.location && (
                    <div className={`p-1.5 rounded-xl text-[10px] font-medium flex items-center gap-1.5 border ${
                      isMe
                        ? 'bg-emerald-900/80 text-emerald-100 border-emerald-700'
                        : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                    }`}>
                      <MapPin className="w-3 h-3 text-red-500 shrink-0" />
                      <span>
                        GPS: {msg.location.latitude}, {msg.location.longitude} {msg.location.name ? `(${msg.location.name})` : ''}
                      </span>
                    </div>
                  )}

                  {/* Voice Note Player if present */}
                  {msg.voiceNote && (
                    <div className="my-1">
                      <VoiceNotePlayer voiceNote={msg.voiceNote} isMe={isMe} />
                    </div>
                  )}

                  {/* Attached Photo Image */}
                  {msg.mediaAttachment?.type === 'image' && (
                    <div
                      onClick={() => setLightboxImage({
                        url: msg.mediaAttachment!.url,
                        fileName: msg.mediaAttachment!.fileName,
                        senderName: msg.senderName,
                        caption: msg.content && !['📷 Photo attached', 'Photo attached'].includes(msg.content) ? msg.content : undefined,
                      })}
                      className="my-1 rounded-xl overflow-hidden border border-black/10 relative group cursor-pointer bg-black/5"
                    >
                      <img
                        src={msg.mediaAttachment.url}
                        alt={msg.mediaAttachment.fileName || 'Attached photo'}
                        className="w-full max-h-60 sm:max-h-72 object-cover rounded-xl transition-transform duration-200 group-hover:scale-[1.01]"
                        loading="lazy"
                      />
                      <div className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-lg bg-black/75 backdrop-blur-xs text-white text-[10px] font-medium flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
                        <Eye className="w-3 h-3" />
                        <span>View ({msg.mediaAttachment.fileSizeFormatted || 'Photo'})</span>
                      </div>
                    </div>
                  )}

                  {/* Attached Document Card */}
                  {msg.mediaAttachment?.type === 'document' && (
                    <div className={`my-1 p-2.5 rounded-xl border flex items-center justify-between gap-2.5 ${
                      isMe
                        ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-100'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-900'
                    }`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          msg.mediaAttachment.fileName.toLowerCase().endsWith('.pdf')
                            ? 'bg-red-500/20 text-red-500 border border-red-500/30'
                            : 'bg-blue-500/20 text-blue-500 border border-blue-500/30'
                        }`}>
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-xs truncate max-w-[150px] sm:max-w-[220px]">
                            {msg.mediaAttachment.fileName}
                          </span>
                          <span className={`text-[10px] ${isMe ? 'text-emerald-300' : 'text-zinc-500'}`}>
                            {msg.mediaAttachment.fileSizeFormatted || 'Document'}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => downloadFile(msg.mediaAttachment!.url, msg.mediaAttachment!.fileName)}
                        className={`p-1.5 rounded-lg border transition-all shrink-0 cursor-pointer ${
                          isMe
                            ? 'bg-emerald-800 hover:bg-emerald-700 text-white border-emerald-600'
                            : 'bg-white hover:bg-zinc-100 text-zinc-800 border-zinc-300 shadow-2xs'
                        }`}
                        title="Download document"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Call Event Card if this is a call notification message */}
                  {msg.callInfo && (
                    <div className={`p-2 rounded-xl border flex items-center justify-between gap-2.5 my-1 ${
                      isMe
                        ? 'bg-emerald-950/70 border-emerald-600/60 text-emerald-100'
                        : 'bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-xs'
                    }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isMe ? 'bg-emerald-700 text-emerald-200' : 'bg-emerald-600 text-white shadow-xs'
                        }`}>
                          {msg.callInfo.callType === 'video' ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <span className="text-[11px] font-bold block truncate">
                            {msg.callInfo.isGroup 
                              ? `Group ${msg.callInfo.callType === 'video' ? 'Video' : 'Voice'} Call` 
                              : `${msg.callInfo.callType === 'video' ? 'Video' : 'Voice'} Call`
                            }
                          </span>
                          <span className="text-[10px] opacity-80 block truncate">
                            {msg.callInfo.isGroup 
                              ? 'Channel Call' 
                              : (msg.callInfo.targetUserName ? `To: ${msg.callInfo.targetUserName}` : 'Direct Call')
                            }
                          </span>
                        </div>
                      </div>

                      {/* In-Chat Call Back / Join action button */}
                      {!isMe && (
                        <button
                          type="button"
                          onClick={() => {
                            if (msg.callInfo?.isGroup) {
                              handleStartGroupCall(currentChannel, msg.callInfo.callType);
                            } else {
                              handleStartDirectCall({
                                id: msg.senderId,
                                name: msg.senderName,
                                phone: msg.senderPhone || '',
                                role: (msg.senderRole as UserRole) || 'primary_user',
                                subCounty: msg.senderSubCounty,
                              }, msg.callInfo!.callType);
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1 shadow-xs transition-all active:scale-95 cursor-pointer shrink-0"
                          title="Call back or rejoin call"
                        >
                          <PhoneCall className="w-3 h-3" />
                          <span>{msg.callInfo.isGroup ? 'Join' : 'Call Back'}</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Message Content */}
                  {msg.content && !['📷 Photo attached', 'Photo attached'].includes(msg.content) && (
                    <p className="leading-relaxed whitespace-pre-wrap select-text">
                      {msg.content}
                    </p>
                  )}

                  {/* Message Footer: Time + status tick */}
                  <div className={`flex items-center justify-end gap-1 text-[9px] ${
                    isMe ? 'text-emerald-200' : 'text-zinc-400'
                  }`}>
                    <span>{formatTime(msg.timestamp)}</span>
                    {isMe && <CheckCheck className="w-3 h-3 stroke-[2.5]" />}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Input Area - Always docked, zero overflow */}
        <div className="p-2 sm:p-2.5 bg-white border-t border-zinc-200 space-y-1.5 shrink-0 z-10">
          {/* Hidden File Inputs for Photos and Documents */}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelect}
          />
          <input
            ref={docInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx"
            className="hidden"
            onChange={handleDocSelect}
          />

          {isChannelRestricted ? (
            /* Restricted Channel Notice */
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-700 shrink-0" />
                <span>#{currentChannel.name} is reserved for authorized field officers and veterinary personnel.</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setActiveChannelId('general')}
                  className="flex-1 sm:flex-initial px-2.5 py-1 bg-amber-200/80 hover:bg-amber-300 text-amber-900 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Go to #General
                </button>
                {!currentUser && (
                  <button
                    type="button"
                    onClick={onOpenAuthModal}
                    className="flex-1 sm:flex-initial px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
                  >
                    <LogIn className="w-3 h-3" />
                    <span>Log In as Officer</span>
                  </button>
                )}
              </div>
            </div>
          ) : isRecordingVoiceNote ? (
            /* Active Voice Note Recording Interface */
            <VoiceNoteRecorder
              onSend={handleVoiceNoteSend}
              onCancel={() => setIsRecordingVoiceNote(false)}
            />
          ) : (
            /* Interactive Chat Input Box */
            <form onSubmit={handleSendMessage} className="space-y-2">
              {/* Guest Identity Banner if not logged in */}
              {!currentUser && (
                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-emerald-50/90 border border-emerald-200 text-xs shadow-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    {isEditingGuestName ? (
                      <div className="flex items-center gap-1 flex-wrap">
                        <input
                          type="text"
                          value={tempGuestName}
                          onChange={(e) => setTempGuestName(e.target.value)}
                          placeholder="Your name..."
                          className="px-2 py-0.5 text-xs bg-white rounded-md border border-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-zinc-800 font-medium"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (tempGuestName.trim()) {
                                setGuestName(tempGuestName.trim());
                                localStorage.setItem('dira_guest_name', tempGuestName.trim());
                              }
                              setIsEditingGuestName(false);
                            } else if (e.key === 'Escape') {
                              setIsEditingGuestName(false);
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (tempGuestName.trim()) {
                              setGuestName(tempGuestName.trim());
                              localStorage.setItem('dira_guest_name', tempGuestName.trim());
                            }
                            setIsEditingGuestName(false);
                          }}
                          className="text-[11px] font-bold text-emerald-800 hover:underline px-1 py-0.5 cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsEditingGuestName(false)}
                          className="text-[11px] text-zinc-500 hover:text-zinc-800 px-1 py-0.5 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <span className="text-emerald-950 font-medium truncate text-[11px] sm:text-xs">
                        Posting as: <strong className="font-bold text-emerald-900">{guestName}</strong>
                        <button
                          type="button"
                          onClick={() => {
                            setTempGuestName(guestName);
                            setIsEditingGuestName(true);
                          }}
                          className="ml-1.5 text-[11px] text-emerald-700 underline font-normal hover:text-emerald-900 cursor-pointer"
                        >
                          Change
                        </button>
                      </span>
                    )}
                  </div>
                  <button
                    onClick={onOpenAuthModal}
                    type="button"
                    className="shrink-0 text-[11px] font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-emerald-200 shadow-xs cursor-pointer hover:bg-emerald-100/50 transition-all"
                  >
                    <LogIn className="w-3 h-3" />
                    <span className="hidden sm:inline">Officer / Super User</span>
                    <span>Sign In</span>
                  </button>
                </div>
              )}
              {/* Staged Media Attachment Preview Bar */}
              {pendingAttachment && (
                <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-2 animate-fadeIn">
                  <div className="flex items-center gap-2 min-w-0">
                    {pendingAttachment.type === 'image' ? (
                      <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 border border-emerald-300">
                        <img src={pendingAttachment.url} alt="Thumbnail" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-emerald-950 truncate max-w-[200px] sm:max-w-xs">
                        {pendingAttachment.fileName}
                      </span>
                      <span className="text-[10px] text-emerald-700 font-medium">
                        {pendingAttachment.type === 'image' ? 'Photo ready to send' : 'Document ready to send'} • {pendingAttachment.fileSizeFormatted}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPendingAttachment(null)}
                    className="p-1 rounded-lg text-emerald-700 hover:text-red-700 hover:bg-emerald-100 transition-colors cursor-pointer"
                    title="Remove attachment"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Processing Attachment Indicator */}
              {isProcessingAttachment && (
                <div className="p-2 bg-zinc-100 rounded-xl flex items-center gap-2 text-xs text-zinc-600 animate-fadeIn">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
                  <span>Preparing and compressing attachment...</span>
                </div>
              )}

              {/* Attachment Error Message */}
              {attachmentError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-2 text-xs text-red-800">
                  <span>{attachmentError}</span>
                  <button
                    type="button"
                    onClick={() => setAttachmentError(null)}
                    className="text-red-600 hover:text-red-900 font-bold ml-2"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Attached tags bar */}
              {(selectedCaseTag || attachedLocation) && (
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  {selectedCaseTag && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-red-100 text-red-900 font-bold border border-red-200 text-[11px]">
                      <Tag className="w-3 h-3" />
                      Tag: {selectedCaseTag}
                      <button
                        type="button"
                        onClick={() => setSelectedCaseTag('')}
                        className="ml-1 text-red-600 hover:text-red-900 font-black cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  )}
                  {attachedLocation && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-900 font-bold border border-emerald-200 text-[11px]">
                      <MapPin className="w-3 h-3 text-red-500" />
                      GPS: {attachedLocation.latitude}, {attachedLocation.longitude}
                      <button
                        type="button"
                        onClick={() => setAttachedLocation(null)}
                        className="ml-1 text-emerald-700 hover:text-emerald-900 font-black cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  )}
                </div>
              )}

              {/* Case Picker dropdown if open */}
              {showCasePicker && (
                <div className="p-2 bg-zinc-100 rounded-2xl border border-zinc-200 space-y-1.5 max-h-36 overflow-y-auto">
                  <div className="flex items-center justify-between text-[11px] font-bold text-zinc-600 px-1">
                    <span>Select Incident to Tag:</span>
                    <button
                      type="button"
                      onClick={() => setShowCasePicker(false)}
                      className="text-zinc-500 hover:text-zinc-900 cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {cases.slice(0, 6).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedCaseTag(c.trackingCode);
                          setShowCasePicker(false);
                        }}
                        className="text-left p-1.5 rounded-lg bg-white hover:bg-red-50 text-[11px] border border-zinc-200 text-zinc-800 flex items-center justify-between cursor-pointer"
                      >
                        <span className="font-bold text-red-800">{c.trackingCode}</span>
                        <span className="truncate text-zinc-500 ml-1">{c.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Actions Toolbar: Photo, Document, GPS, Tag Incident */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {/* Photo Attachment Button */}
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={isProcessingAttachment}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 shrink-0 active:scale-95 transition-all touch-manipulation cursor-pointer"
                  title="Attach Photo"
                >
                  <Camera className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span className="text-[11px]">Photo</span>
                </button>

                {/* Document Attachment Button */}
                <button
                  type="button"
                  onClick={() => docInputRef.current?.click()}
                  disabled={isProcessingAttachment}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 shrink-0 active:scale-95 transition-all touch-manipulation cursor-pointer"
                  title="Attach Document (PDF, Word, TXT)"
                >
                  <Paperclip className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                  <span className="text-[11px]">Document</span>
                </button>

                {/* GPS Location Button */}
                <button
                  type="button"
                  onClick={handleAttachLocation}
                  disabled={attachingLocation}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border shrink-0 active:scale-95 transition-all touch-manipulation cursor-pointer ${
                    attachedLocation
                      ? 'bg-emerald-700 text-white border-emerald-800 font-bold'
                      : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200'
                  }`}
                  title="Attach GPS coordinates"
                >
                  <MapPin className={`w-3.5 h-3.5 shrink-0 ${attachedLocation ? 'text-white' : 'text-red-600'}`} />
                  <span className="text-[11px]">{attachedLocation ? 'GPS Attached' : 'Attach GPS'}</span>
                </button>

                {/* Tag Incident Button */}
                <button
                  type="button"
                  onClick={() => setShowCasePicker(!showCasePicker)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border shrink-0 active:scale-95 transition-all touch-manipulation cursor-pointer ${
                    selectedCaseTag
                      ? 'bg-red-700 text-white border-red-800 font-bold'
                      : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200'
                  }`}
                  title="Tag incident code"
                >
                  <Tag className={`w-3.5 h-3.5 shrink-0 ${selectedCaseTag ? 'text-white' : 'text-amber-600'}`} />
                  <span className="text-[11px]">{selectedCaseTag ? selectedCaseTag : 'Tag Case'}</span>
                </button>
              </div>

              {/* Main Typing Row: Input + Voice Note + Send Button */}
              <div className="flex items-center gap-1.5 w-full">
                {/* Text Field */}
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={pendingAttachment ? 'Add a caption (optional)...' : `Message #${currentChannel.name}...`}
                  className="flex-1 min-w-0 h-10 px-3.5 rounded-xl bg-zinc-100 border border-zinc-200 focus:bg-white focus:border-emerald-700 focus:outline-none text-xs sm:text-sm text-zinc-900 transition-all touch-manipulation"
                />

                {/* Voice Note Button */}
                <button
                  type="button"
                  onClick={() => setIsRecordingVoiceNote(true)}
                  className="h-10 w-10 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 transition-all flex items-center justify-center shrink-0 active:scale-95 touch-manipulation cursor-pointer"
                  title="Record Voice Note"
                >
                  <Mic className="w-4 h-4 text-emerald-800" />
                </button>

                {/* Send Button - Always visible on all screens */}
                <button
                  id="chat-send-message-btn"
                  type="submit"
                  disabled={(!inputText.trim() && !attachedLocation && !pendingAttachment) || isSending || isProcessingAttachment}
                  className="h-10 px-3.5 sm:px-4 rounded-xl bg-emerald-800 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm shrink-0 active:scale-95 touch-manipulation cursor-pointer border border-emerald-900"
                  title="Send Message"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Lightbox for Viewing Photos */}
      <PhotoLightboxModal
        isOpen={!!lightboxImage}
        onClose={() => setLightboxImage(null)}
        imageUrl={lightboxImage?.url || ''}
        fileName={lightboxImage?.fileName}
        senderName={lightboxImage?.senderName}
        caption={lightboxImage?.caption}
      />

      {/* Start Call & User Selection Modal */}
      <StartCallModal
        isOpen={isStartCallModalOpen}
        onClose={() => setIsStartCallModalOpen(false)}
        activeChannel={currentChannel}
        allChannels={CHANNELS}
        allUsers={userList}
        onlineUserIds={onlineUserIds}
        currentUser={currentUser}
        onStartGroupCall={handleStartGroupCall}
        onStartDirectCall={handleStartDirectCall}
      />
    </div>
  );
};
