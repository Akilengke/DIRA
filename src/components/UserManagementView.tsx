import React, { useState, useMemo } from 'react';
import { 
  Users, UserPlus, Trash2, Search, Shield, 
  MapPin, Phone, CheckCircle2, AlertTriangle, 
  X, Copy, Check, UserCheck, Key, Lock, Sparkles, Building2
} from 'lucide-react';
import { UserProfile, UserRole } from '../types';
import { SUPER_ADMIN_ACCOUNT, KITUI_SUB_COUNTIES, SUB_COUNTY_COORDINATES } from '../data/mockData';

interface UserManagementViewProps {
  currentUser: UserProfile;
  allUsers: UserProfile[];
  onAddUser: (newUser: UserProfile) => Promise<void>;
  onDeleteUser: (userId: string, userPhone?: string) => Promise<void>;
  onRefreshUsers?: () => void;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  currentUser,
  allUsers,
  onAddUser,
  onDeleteUser,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // New user form state
  const [formData, setFormData] = useState<{
    name: string;
    phone: string;
    role: UserRole;
    designation: string;
    department: string;
    organization: string;
    subCounty: string;
    village: string;
    password: string;
    badgeNumber: string;
  }>({
    name: '',
    phone: '',
    role: 'field_officer',
    designation: '',
    department: 'County Equine Welfare Unit',
    organization: 'DIRA County Administration',
    subCounty: 'Kitui Central',
    village: 'Kitui Town HQ',
    password: '1234',
    badgeNumber: '',
  });

  const showSuccess = (msg: string) => {
    setActionSuccessMessage(msg);
    setTimeout(() => setActionSuccessMessage(null), 4000);
  };

  const handleCopy = (text: string, id: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Filter users
  const filteredUsers = useMemo(() => {
    return allUsers.filter(u => {
      // Role filter
      if (roleFilter !== 'all') {
        if (roleFilter === 'super_admin' && u.role !== 'super_admin') return false;
        if (roleFilter === 'officers' && !['super_user', 'field_officer', 'chief_officer', 'veterinary_officer'].includes(u.role)) return false;
        if (roleFilter === 'community' && !['primary_user', 'village_elder', 'donkey_owner'].includes(u.role)) return false;
        if (roleFilter === u.role) return true;
        if (roleFilter !== 'super_admin' && roleFilter !== 'officers' && roleFilter !== 'community' && u.role !== roleFilter) return false;
      }

      // Search query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        u.name.toLowerCase().includes(q) ||
        (u.phone && u.phone.toLowerCase().includes(q)) ||
        (u.role && u.role.toLowerCase().includes(q)) ||
        (u.designation && u.designation.toLowerCase().includes(q)) ||
        (u.subCounty && u.subCounty.toLowerCase().includes(q)) ||
        (u.village && u.village.toLowerCase().includes(q))
      );
    });
  }, [allUsers, roleFilter, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const total = allUsers.length;
    const admins = allUsers.filter(u => u.role === 'super_admin').length;
    const officers = allUsers.filter(u => ['super_user', 'field_officer', 'chief_officer', 'veterinary_officer'].includes(u.role)).length;
    const community = allUsers.filter(u => ['primary_user', 'village_elder', 'donkey_owner'].includes(u.role)).length;
    return { total, admins, officers, community };
  }, [allUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    if (!formData.phone.trim()) return;

    setIsSubmitting(true);
    try {
      const generatedId = `usr-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const coords = SUB_COUNTY_COORDINATES[formData.subCounty] || { lat: -1.3688, lng: 38.0108 };

      const newUser: UserProfile = {
        id: generatedId,
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        role: formData.role,
        roleTitle: formData.designation.trim() || formData.role.replace('_', ' ').toUpperCase(),
        designation: formData.designation.trim() || undefined,
        department: formData.department.trim() || undefined,
        organization: formData.organization.trim() || 'DIRA County Administration',
        badgeNumber: formData.badgeNumber.trim() || undefined,
        subCounty: formData.subCounty,
        village: formData.village.trim() || `${formData.subCounty} Base`,
        password: formData.password.trim() || '1234',
        coordinates: coords,
        isOnline: true,
      };

      await onAddUser(newUser);
      setIsAddModalOpen(false);
      showSuccess(`Account for "${newUser.name}" created and synced to Cloud Firebase.`);
      // Reset form
      setFormData({
        name: '',
        phone: '',
        role: 'field_officer',
        designation: '',
        department: 'County Equine Welfare Unit',
        organization: 'DIRA County Administration',
        subCounty: 'Kitui Central',
        village: 'Kitui Town HQ',
        password: '1234',
        badgeNumber: '',
      });
    } catch (err: any) {
      alert(`Failed to create user: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    setIsSubmitting(true);
    try {
      await onDeleteUser(userToDelete.id, userToDelete.phone);
      showSuccess(`User account "${userToDelete.name}" deleted from Cloud Firebase.`);
      setUserToDelete(null);
    } catch (err: any) {
      alert(`Failed to delete user: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'super_admin':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-900 border border-purple-200">
            <Shield className="w-3 h-3 text-purple-700" /> Super Admin
          </span>
        );
      case 'super_user':
      case 'chief_officer':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-200">
            <Shield className="w-3 h-3 text-blue-700" /> Officer Lead
          </span>
        );
      case 'field_officer':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-100 text-cyan-900 border border-cyan-200">
            <Shield className="w-3 h-3 text-cyan-700" /> Field Officer
          </span>
        );
      case 'veterinary_officer':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200">
            <Sparkles className="w-3 h-3 text-amber-700" /> Vet Officer
          </span>
        );
      case 'village_elder':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
            <Users className="w-3 h-3 text-emerald-700" /> Village Elder
          </span>
        );
      case 'donkey_owner':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-900 border border-orange-200">
            <Users className="w-3 h-3 text-orange-700" /> Donkey Owner
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-zinc-100 text-zinc-800 border border-zinc-200">
            <Users className="w-3 h-3 text-zinc-600" /> Community User
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-10">
      {/* Top Banner: Super Admin Center */}
      <div className="bg-gradient-to-r from-purple-950 via-zinc-900 to-zinc-900 text-white p-4 sm:p-5 rounded-2xl shadow-sm border border-purple-900/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-200 text-xs font-bold border border-purple-400/30">
              <Shield className="w-3.5 h-3.5 text-purple-300" /> Super Admin Authority
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              User Accounts & Cloud Database
            </h1>
            <p className="text-xs sm:text-sm text-zinc-300">
              All accounts and login credentials are stored securely in Google Firebase Firestore.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="admin-add-user-top-btn"
              onClick={() => setIsAddModalOpen(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md transition-all border border-emerald-500 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add New User</span>
            </button>
          </div>
        </div>

        {/* Cloud Sync Status */}
        <div className="mt-4 pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-zinc-300 font-medium">Cloud Firebase Firestore: Active & Synchronized</span>
          </div>
          <div className="text-[11px] text-purple-300 font-mono">
            Logged in: <strong className="text-white">{currentUser.name}</strong> ({currentUser.phone})
          </div>
        </div>
      </div>

      {/* Success Notification */}
      {actionSuccessMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs sm:text-sm flex items-center justify-between gap-2 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccessMessage}</span>
          </div>
          <button 
            onClick={() => setActionSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Quick Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-2xs">
          <p className="text-[11px] text-zinc-700 font-semibold uppercase tracking-wider">Total Accounts</p>
          <p className="text-xl sm:text-2xl font-black text-zinc-900 mt-0.5">{stats.total}</p>
          <p className="text-[10px] text-zinc-700 mt-0.5">Firebase stored</p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-2xs">
          <p className="text-[11px] text-zinc-700 font-semibold uppercase tracking-wider">Super Admins</p>
          <p className="text-xl sm:text-2xl font-black text-purple-900 mt-0.5">{stats.admins}</p>
          <p className="text-[10px] text-zinc-700 mt-0.5">Primary oversight</p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-2xs">
          <p className="text-[11px] text-zinc-700 font-semibold uppercase tracking-wider">Officers / Vets</p>
          <p className="text-xl sm:text-2xl font-black text-blue-900 mt-0.5">{stats.officers}</p>
          <p className="text-[10px] text-zinc-700 mt-0.5">Field responders</p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-2xs">
          <p className="text-[11px] text-zinc-700 font-semibold uppercase tracking-wider">Community Users</p>
          <p className="text-xl sm:text-2xl font-black text-emerald-900 mt-0.5">{stats.community}</p>
          <p className="text-[10px] text-zinc-700 mt-0.5">Citizens & owners</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-2xs space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="admin-search-users-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone / login ID, designation, sub-county..."
            className="w-full pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:bg-white transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Role Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <button
            onClick={() => setRoleFilter('all')}
            className={`px-3 py-1 rounded-lg font-semibold transition-all whitespace-nowrap ${
              roleFilter === 'all'
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            All Accounts ({allUsers.length})
          </button>
          <button
            onClick={() => setRoleFilter('super_admin')}
            className={`px-3 py-1 rounded-lg font-semibold transition-all whitespace-nowrap ${
              roleFilter === 'super_admin'
                ? 'bg-purple-900 text-white'
                : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
            }`}
          >
            Super Admin ({stats.admins})
          </button>
          <button
            onClick={() => setRoleFilter('officers')}
            className={`px-3 py-1 rounded-lg font-semibold transition-all whitespace-nowrap ${
              roleFilter === 'officers'
                ? 'bg-blue-900 text-white'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            Officers & Vets ({stats.officers})
          </button>
          <button
            onClick={() => setRoleFilter('community')}
            className={`px-3 py-1 rounded-lg font-semibold transition-all whitespace-nowrap ${
              roleFilter === 'community'
                ? 'bg-emerald-900 text-white'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            Community ({stats.community})
          </button>
        </div>
      </div>

      {/* User Accounts List */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
          <span>Displaying {filteredUsers.length} of {allUsers.length} account{allUsers.length === 1 ? '' : 's'}</span>
          <span>Synced with Firebase</span>
        </div>

        {filteredUsers.length === 0 ? (
          <div className="bg-white p-8 text-center rounded-2xl border border-zinc-200 space-y-2">
            <Users className="w-8 h-8 text-zinc-400 mx-auto" />
            <p className="text-sm font-bold text-zinc-700">No matching accounts found</p>
            <p className="text-xs text-zinc-500">
              Try adjusting your search query or click "Add New User" to register a new account.
            </p>
          </div>
        ) : (
          filteredUsers.map((user) => {
            const isSuperAdminUser = user.id === SUPER_ADMIN_ACCOUNT.id || user.phone === 'admin';
            const isMe = user.id === currentUser.id;

            return (
              <div 
                key={user.id}
                className={`bg-white p-3.5 sm:p-4 rounded-xl border transition-all ${
                  isSuperAdminUser 
                    ? 'border-purple-300 shadow-xs bg-gradient-to-r from-purple-50/40 to-white' 
                    : 'border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Left: User Details */}
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-sm sm:text-base font-bold text-zinc-900 truncate">
                        {user.name}
                      </h2>
                      {getRoleBadge(user.role)}
                      {isMe && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-zinc-900 text-white">
                          You (Current)
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600">
                      {/* Phone / Login ID */}
                      <div className="inline-flex items-center gap-1 font-mono font-medium text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded">
                        <Phone className="w-3 h-3 text-zinc-500" />
                        <span>Login ID: {user.phone}</span>
                        <button
                          onClick={() => handleCopy(user.phone, `phone-${user.id}`)}
                          className="text-zinc-400 hover:text-zinc-700 ml-1"
                          title="Copy Login Phone/ID"
                        >
                          {copiedId === `phone-${user.id}` ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>

                      {/* Password Info */}
                      {user.password && (
                        <div className="inline-flex items-center gap-1 font-mono text-zinc-600 bg-zinc-50 px-2 py-0.5 rounded border border-zinc-200 text-[11px]">
                          <Key className="w-3 h-3 text-zinc-400" />
                          <span>PIN: {user.password}</span>
                        </div>
                      )}

                      {/* Designation */}
                      {user.designation && (
                        <span className="text-zinc-600 font-medium">
                          • {user.designation}
                        </span>
                      )}

                      {/* Sub-county & village */}
                      {(user.subCounty || user.village) && (
                        <span className="inline-flex items-center gap-1 text-zinc-500">
                          <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
                          <span>{user.village ? `${user.village}, ` : ''}{user.subCounty}</span>
                        </span>
                      )}
                    </div>

                    {/* Department / Org */}
                    {(user.department || user.organization) && (
                      <p className="text-[11px] text-zinc-400 flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-zinc-400 shrink-0" />
                        <span>{user.department || user.organization}</span>
                        {user.badgeNumber && <span className="font-mono text-zinc-500">({user.badgeNumber})</span>}
                      </p>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {isSuperAdminUser ? (
                      <span className="text-[11px] font-semibold text-purple-700 bg-purple-100/70 px-2.5 py-1 rounded-lg border border-purple-200">
                        Protected Root Admin
                      </span>
                    ) : (
                      <button
                        id={`delete-user-${user.id}-btn`}
                        onClick={() => setUserToDelete(user)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-800 border border-red-200 text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                        title="Delete User from Firebase"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL: ADD NEW USER */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div 
            className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-zinc-200 bg-zinc-50/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-100 text-purple-800">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900">Add New User Account</h3>
                  <p className="text-xs text-zinc-500">Will be saved to Cloud Firebase Firestore</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateUser} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs sm:text-sm">
              {/* Full Name */}
              <div>
                <label className="block font-bold text-zinc-700 mb-1">
                  Full Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Senior Chief James Mutua, Dr. Faith Kilonzo"
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 focus:bg-white"
                />
              </div>

              {/* Phone / Login ID & Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">
                    Phone / Login ID <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="e.g. 0712345678 or officer_mwingi"
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 focus:bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-zinc-700 mb-1">
                    PIN / Password <span className="text-zinc-400 font-normal">(Defaults to 1234)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="1234"
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 focus:bg-white font-mono"
                  />
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block font-bold text-zinc-700 mb-1">
                  User Role & Access Tier <span className="text-red-600">*</span>
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 focus:bg-white"
                >
                  <option value="field_officer">Field Officer (Incident Responder)</option>
                  <option value="super_user">Super User / Police OCS (County Desk)</option>
                  <option value="chief_officer">Chief Officer / Administrator</option>
                  <option value="veterinary_officer">Equine Veterinary Officer</option>
                  <option value="village_elder">Village Elder (Nyumba Kumi Monitor)</option>
                  <option value="donkey_owner">Donkey Owner (Community Livestock)</option>
                  <option value="primary_user">Primary Community User (Citizen)</option>
                  <option value="super_admin">Super Administrator (Full System Control)</option>
                </select>
              </div>

              {/* Designation & Badge */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">
                    Official Designation / Title
                  </label>
                  <input
                    type="text"
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    placeholder="e.g. Area Senior Chief, OCS Police"
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-zinc-700 mb-1">
                    Badge Number <span className="text-zinc-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.badgeNumber}
                    onChange={(e) => setFormData({ ...formData, badgeNumber: e.target.value })}
                    placeholder="e.g. NPS-10294 or KVB-VET-441"
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 focus:bg-white font-mono"
                  />
                </div>
              </div>

              {/* Sub-County & Village */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">
                    Sub-County
                  </label>
                  <select
                    value={formData.subCounty}
                    onChange={(e) => setFormData({ ...formData, subCounty: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 focus:bg-white"
                  >
                    {KITUI_SUB_COUNTIES.map((sc) => (
                      <option key={sc.name} value={sc.name}>{sc.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-zinc-700 mb-1">
                    Village / Town HQ
                  </label>
                  <input
                    type="text"
                    value={formData.village}
                    onChange={(e) => setFormData({ ...formData, village: e.target.value })}
                    placeholder="e.g. Migwani HQ, Ngongoni"
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 focus:bg-white"
                  />
                </div>
              </div>

              {/* Department */}
              <div>
                <label className="block font-bold text-zinc-700 mb-1">
                  Department / Unit
                </label>
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  placeholder="e.g. County Equine Welfare Unit, National Police Service"
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 focus:bg-white"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-zinc-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl font-bold shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <span>Saving to Firebase...</span>
                  ) : (
                    <>
                      <UserCheck className="w-4 h-4" />
                      <span>Create & Store in Firebase</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONFIRMATION */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div 
            className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3 text-red-700">
                <div className="p-2.5 rounded-full bg-red-100">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900">Confirm Account Deletion</h3>
                  <p className="text-xs text-zinc-500">Cloud Firebase Firestore record</p>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                Are you sure you want to permanently delete the account for{' '}
                <strong className="text-zinc-900 font-bold">{userToDelete.name}</strong>{' '}
                (Login ID: <code className="bg-zinc-100 px-1 py-0.5 rounded font-mono text-zinc-800">{userToDelete.phone}</code>)?
              </p>

              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-[11px] text-red-800">
                <strong>Permanent Action:</strong> This account will be deleted from the Cloud Firebase Firestore database, removing all login privileges.
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setUserToDelete(null)}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl font-semibold transition-all text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5 text-xs cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isSubmitting ? 'Deleting...' : 'Delete from Firebase'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
