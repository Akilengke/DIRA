import React, { useState, useMemo, useEffect } from 'react';
import { 
  Phone, 
  Video, 
  Users, 
  User, 
  Search, 
  X, 
  Shield, 
  CheckCircle2, 
  Radio, 
  ChevronRight,
  Globe,
  Smartphone,
  Laptop,
  Tablet,
  Cpu
} from 'lucide-react';
import { UserProfile, ChatChannel, CallType, LoggedInDevice } from '../types';
import { subscribeToLoggedInDevices, getOrCreateDeviceId } from '../services/deviceTrackingService';

interface StartCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeChannel: ChatChannel;
  allChannels: ChatChannel[];
  allUsers: UserProfile[];
  onlineUserIds?: string[];
  currentUser: UserProfile | null;
  onStartGroupCall: (channel: ChatChannel, callType: CallType) => void;
  onStartDirectCall: (
    targetUser: UserProfile, 
    callType: CallType, 
    targetDeviceId?: string, 
    targetDeviceName?: string
  ) => void;
}

export const StartCallModal: React.FC<StartCallModalProps> = ({
  isOpen,
  onClose,
  activeChannel,
  allChannels,
  allUsers,
  onlineUserIds = [],
  currentUser,
  onStartGroupCall,
  onStartDirectCall,
}) => {
  const [activeTab, setActiveTab] = useState<'group' | 'direct' | 'devices'>('group');
  const [selectedChannelId, setSelectedChannelId] = useState(activeChannel.id);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all');
  const [devices, setDevices] = useState<LoggedInDevice[]>([]);
  const myDeviceId = useMemo(() => getOrCreateDeviceId(), []);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribeToLoggedInDevices((list) => {
      setDevices(list || []);
    });
    return () => unsub();
  }, [isOpen]);

  // Filter users
  const filteredUsers = useMemo(() => {
    return allUsers.filter((u) => {
      // Don't show current user in list
      if (currentUser && (u.id === currentUser.id || u.phone === currentUser.phone)) {
        return false;
      }

      if (selectedRoleFilter !== 'all' && u.role !== selectedRoleFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = u.name?.toLowerCase().includes(q);
        const matchPhone = u.phone?.toLowerCase().includes(q);
        const matchSubCounty = u.subCounty?.toLowerCase().includes(q);
        const matchRole = u.role?.toLowerCase().includes(q);
        const matchDesignation = u.designation?.toLowerCase().includes(q);
        return matchName || matchPhone || matchSubCounty || matchRole || matchDesignation;
      }

      return true;
    });
  }, [allUsers, currentUser, selectedRoleFilter, searchQuery]);

  // Filter devices
  const filteredDevices = useMemo(() => {
    if (!searchQuery.trim()) return devices;
    const q = searchQuery.toLowerCase();
    return devices.filter((d) => 
      d.deviceModel?.toLowerCase().includes(q) ||
      d.userName?.toLowerCase().includes(q) ||
      d.userPhone?.toLowerCase().includes(q) ||
      d.subCounty?.toLowerCase().includes(q)
    );
  }, [devices, searchQuery]);

  if (!isOpen) return null;

  const targetChannel = allChannels.find(c => c.id === selectedChannelId) || activeChannel;

  const getDeviceIcon = (type?: string) => {
    if (type === 'tablet') return <Tablet className="w-4 h-4" />;
    if (type === 'desktop') return <Laptop className="w-4 h-4" />;
    return <Smartphone className="w-4 h-4" />;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-zinc-200 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900">Start Voice or Video Call</h3>
              <p className="text-xs text-zinc-500">Encrypted real-time calling across devices</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="px-4 pt-3 pb-2 flex gap-1.5 border-b border-zinc-100 bg-white">
          <button
            onClick={() => setActiveTab('group')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'group'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span className="truncate">Channel</span>
          </button>
          <button
            onClick={() => setActiveTab('direct')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'direct'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span className="truncate">Users</span>
          </button>
          <button
            onClick={() => setActiveTab('devices')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'devices'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="truncate">Devices ({devices.length})</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'group' && (
            /* GROUP CALL TAB */
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                    Channel Room: #{targetChannel.name}
                  </span>
                  <span className="text-[11px] bg-emerald-200/70 text-emerald-900 px-2 py-0.5 rounded-full font-bold">
                    Multi-user
                  </span>
                </div>
                <p className="text-xs text-emerald-900/80 leading-relaxed">
                  {targetChannel.description}
                </p>
                <div className="text-[11px] text-emerald-800/90 pt-1 flex items-center gap-1">
                  <Globe className="w-3 h-3 text-emerald-600" />
                  <span>All community members and field units online will receive the incoming call.</span>
                </div>
              </div>

              {/* Select Different Channel if desired */}
              <div>
                <label className="text-xs font-bold text-zinc-700 block mb-1.5">
                  Select Channel for Group Call:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {allChannels.map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => setSelectedChannelId(ch.id)}
                      className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                        selectedChannelId === ch.id
                          ? 'border-emerald-600 bg-emerald-50/50 text-emerald-950 ring-1 ring-emerald-500'
                          : 'border-zinc-200 hover:border-zinc-300 text-zinc-700 bg-zinc-50/50'
                      }`}
                    >
                      <span className="truncate">#{ch.name}</span>
                      {selectedChannelId === ch.id && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 ml-1" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Group Call Start Buttons */}
              <div className="pt-2 space-y-2">
                <button
                  onClick={() => {
                    onStartGroupCall(targetChannel, 'video');
                    onClose();
                  }}
                  className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-98 cursor-pointer"
                >
                  <Video className="w-4 h-4" />
                  <span>Start Group Video Call in #{targetChannel.name}</span>
                </button>

                <button
                  onClick={() => {
                    onStartGroupCall(targetChannel, 'audio');
                    onClose();
                  }}
                  className="w-full py-2.5 px-4 rounded-2xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 border border-zinc-300 transition-all active:scale-98 cursor-pointer"
                >
                  <Phone className="w-4 h-4 text-emerald-700" />
                  <span>Start Group Voice-Only Call (Low Data)</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'direct' && (
            /* DIRECT 1-ON-1 CALL TAB */
            <div className="space-y-3">
              {/* Search input */}
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search user by name, phone, sub-county, role..."
                  className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                />
              </div>

              {/* Role filter chips */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 text-[11px]">
                {[
                  { id: 'all', label: 'All Users' },
                  { id: 'field_officer', label: 'Field Officers' },
                  { id: 'veterinary_officer', label: 'Veterinary' },
                  { id: 'chief_officer', label: 'Chiefs / Elders' },
                  { id: 'reporter', label: 'Community' },
                ].map((rf) => (
                  <button
                    key={rf.id}
                    onClick={() => setSelectedRoleFilter(rf.id)}
                    className={`px-2.5 py-1 rounded-lg font-bold shrink-0 transition-all cursor-pointer ${
                      selectedRoleFilter === rf.id
                        ? 'bg-zinc-900 text-white'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                  >
                    {rf.label}
                  </button>
                ))}
              </div>

              {/* User Directory List */}
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {filteredUsers.length === 0 ? (
                  <div className="p-6 text-center text-zinc-400 text-xs">
                    No users matching "{searchQuery}". They can sign up or join public chat anytime!
                  </div>
                ) : (
                  filteredUsers.map((user) => {
                    const isOnline = onlineUserIds.includes(user.id) || onlineUserIds.includes(user.phone);
                    const userDevice = devices.find(d => d.userId === user.id || (user.phone && d.userPhone === user.phone));

                    return (
                      <div
                        key={user.id}
                        className="p-2.5 sm:p-3 rounded-2xl bg-zinc-50/80 hover:bg-emerald-50/40 border border-zinc-200 hover:border-emerald-300 transition-all flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-900 font-bold flex items-center justify-center text-sm">
                              {(user.name || 'U')[0].toUpperCase()}
                            </div>
                            <span 
                              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                                isOnline ? 'bg-emerald-500' : 'bg-zinc-400'
                              }`} 
                              title={isOnline ? 'Online now' : 'Registered user'}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-zinc-900 flex items-center gap-1.5 truncate">
                              <span>{user.name}</span>
                              {user.role && user.role !== 'reporter' && (
                                <span className="text-[10px] bg-zinc-200 text-zinc-700 px-1.5 py-0.2 rounded font-medium">
                                  {user.role.replace('_', ' ')}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-500 truncate">
                              {user.subCounty || 'Kitui County'} • {user.phone}
                              {userDevice && (
                                <span className="text-emerald-700 font-medium ml-1.5">
                                  • 📱 {userDevice.deviceModel}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Call Action Buttons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Direct Voice Call */}
                          <button
                            onClick={() => {
                              onStartDirectCall(user, 'audio', userDevice?.deviceId, userDevice?.deviceModel);
                              onClose();
                            }}
                            className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-zinc-100 hover:bg-emerald-100 text-emerald-800 hover:text-emerald-950 border border-zinc-200 hover:border-emerald-300 flex items-center justify-center transition-all cursor-pointer"
                            title={`Voice Call ${user.name}`}
                          >
                            <Phone className="w-4 h-4" />
                          </button>

                          {/* Direct Video Call */}
                          <button
                            onClick={() => {
                              onStartDirectCall(user, 'video', userDevice?.deviceId, userDevice?.deviceModel);
                              onClose();
                            }}
                            className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition-all shadow-xs cursor-pointer"
                            title={`Video Call ${user.name}`}
                          >
                            <Video className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === 'devices' && (
            /* ACTIVE DEVICES TAB */
            <div className="space-y-3">
              <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200 text-xs text-zinc-600 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Real-time list of all logged-in smartphones, tablets, and browser stations. You can dial any individual device directly.
                </span>
              </div>

              {/* Device Search */}
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search device model, officer, or county..."
                  className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                />
              </div>

              {/* Devices List */}
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {filteredDevices.length === 0 ? (
                  <div className="p-6 text-center text-zinc-400 text-xs">
                    No active devices found. Open the app on another phone or browser window to see it appear here!
                  </div>
                ) : (
                  filteredDevices.map((dev) => {
                    const isMyDevice = dev.deviceId === myDeviceId || dev.deviceId.startsWith(myDeviceId) || myDeviceId.startsWith(dev.deviceId);

                    return (
                      <div
                        key={dev.deviceId}
                        className={`p-2.5 sm:p-3 rounded-2xl border transition-all flex items-center justify-between gap-2 ${
                          isMyDevice 
                            ? 'bg-zinc-100/80 border-zinc-300'
                            : 'bg-zinc-50/80 hover:bg-emerald-50/40 border-zinc-200 hover:border-emerald-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative">
                            <div className={`w-10 h-10 rounded-xl font-bold flex items-center justify-center text-sm ${
                              isMyDevice ? 'bg-zinc-200 text-zinc-700' : 'bg-emerald-100 text-emerald-900'
                            }`}>
                              {getDeviceIcon(dev.deviceType)}
                            </div>
                            <span 
                              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                                dev.isOnline !== false ? 'bg-emerald-500' : 'bg-zinc-400'
                              }`} 
                              title={dev.isOnline !== false ? 'Online & Ready' : 'Standby'}
                            />
                          </div>

                          <div className="min-w-0">
                            <div className="text-xs font-bold text-zinc-900 flex items-center gap-1.5 truncate">
                              <span>{dev.deviceModel}</span>
                              {isMyDevice ? (
                                <span className="text-[10px] bg-zinc-300 text-zinc-800 px-1.5 py-0.2 rounded-full font-bold">
                                  This Device
                                </span>
                              ) : (
                                <span className="text-[10px] bg-emerald-100 text-emerald-900 px-1.5 py-0.2 rounded-full font-bold">
                                  Ready to Call
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-500 truncate">
                              {dev.userName} • {dev.subCounty || 'Kitui County'}
                            </div>
                          </div>
                        </div>

                        {/* Call Action Buttons */}
                        {!isMyDevice ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Call Device Voice */}
                            <button
                              onClick={() => {
                                onStartDirectCall(
                                  {
                                    id: dev.userId,
                                    name: dev.userName,
                                    role: dev.userRole,
                                    phone: dev.userPhone,
                                    subCounty: dev.subCounty,
                                  },
                                  'audio',
                                  dev.deviceId,
                                  dev.deviceModel
                                );
                                onClose();
                              }}
                              className="h-8 px-2.5 rounded-xl bg-zinc-100 hover:bg-emerald-100 text-emerald-800 hover:text-emerald-950 border border-zinc-200 hover:border-emerald-300 flex items-center gap-1 text-xs font-bold transition-all cursor-pointer"
                              title={`Voice Call this ${dev.deviceModel}`}
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Voice</span>
                            </button>

                            {/* Call Device Video */}
                            <button
                              onClick={() => {
                                onStartDirectCall(
                                  {
                                    id: dev.userId,
                                    name: dev.userName,
                                    role: dev.userRole,
                                    phone: dev.userPhone,
                                    subCounty: dev.subCounty,
                                  },
                                  'video',
                                  dev.deviceId,
                                  dev.deviceModel
                                );
                                onClose();
                              }}
                              className="h-8 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 text-xs font-bold transition-all shadow-xs cursor-pointer"
                              title={`Video Call this ${dev.deviceModel}`}
                            >
                              <Video className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Video</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-zinc-400 italic shrink-0 pr-2">
                            Current device
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
