import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Search, 
  Shield, 
  Activity, 
  Lock, 
  Unlock, 
  Trash2, 
  Clock, 
  UserCheck,
  User,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  LayoutDashboard,
  Loader2
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import TechnicalLabel from "@/components/ui/technical-label";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";


interface TeamMember {
  id: string;
  name: string;
  email: string;
  accessLevel: 'founder' | 'admin' | 'team';
  permissions: string[];
  isActive: boolean;
  lastUsed: string;
}

export function TeamKeysManager() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("team");
  const [newMemberPermissions, setNewMemberPermissions] = useState<string[]>([]);
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);

  const ADMIN_SECTIONS = [
    { id: "payouts", name: "Payout Queue" },
    { id: "users", name: "User CRM" },
    { id: "inbox", name: "Inbox" },
    { id: "audit", name: "Audit Logs" },
    { id: "team", name: "Team Keys" },
  ];

  const { data, isLoading } = useQuery<{ members: TeamMember[] }>({
    queryKey: ['/api/team/members'],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return await apiRequest("PATCH", `/api/team/members/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/team/members'] });
      toast({ title: "Node Protocol Updated", description: "Team member operational status has been synchronized." });
    },
    onError: (err: any) => toast({ title: "Status Update Failed", description: err?.message ?? "An unexpected error occurred.", variant: "destructive" }),
  });

  const addMemberMutation = useMutation({
    mutationFn: async ({ email, role, permissions }: { email: string; role: string, permissions?: string[] }) => {
      return await apiRequest("POST", "/api/team/members", { email, role, permissions });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/team/members'] });
      toast({ title: "Cryptographic Key Minted", description: "Node access granted successfully." });
      setNewMemberEmail("");
      setNewMemberPermissions([]);
      setIsDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Issuance Failed", description: error.message || "Target node unverified or missing.", variant: "destructive" });
    }
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, accessLevel }: { id: string; accessLevel: string }) => {
      return await apiRequest("PATCH", `/api/team/members/${id}`, { accessLevel });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/team/members'] });
      toast({ title: "Privilege Updated", description: "Team member role has been modified." });
    },
    onError: (err: any) => toast({ title: "Role Update Failed", description: err?.message ?? "An unexpected error occurred.", variant: "destructive" }),
  });

  const deleteMemberMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/team/members/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/team/members'] });
      toast({ title: "Member Terminated", description: "Team access has been permanently revoked." });
    },
    onError: (err: any) => toast({ title: "Removal Failed", description: err?.message ?? "An unexpected error occurred.", variant: "destructive" }),
  });

  const updatePermissionsMutation = useMutation({
    mutationFn: async ({ id, permissions }: { id: string; permissions: string[] }) => {
      return await apiRequest("PATCH", `/api/team/members/${id}/permissions`, { permissions });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/team/members'] });
      toast({ title: "Matrix Reconfigured", description: "Node access permissions have been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    }
  });

  const handlePermissionToggle = (member: TeamMember, sectionId: string) => {
    const currentPerms = member.permissions || [];
    const newPerms = currentPerms.includes(sectionId)
      ? currentPerms.filter(p => p !== sectionId)
      : [...currentPerms, sectionId];
    
    updatePermissionsMutation.mutate({ id: member.id, permissions: newPerms });
  };

  const handleToggleAllPermissions = (member: TeamMember, grantAll: boolean) => {
    const newPerms = grantAll ? ADMIN_SECTIONS.map(s => s.id) : [];
    updatePermissionsMutation.mutate({ id: member.id, permissions: newPerms });
  };

  const filtered = data?.members.filter(m => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.email.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black tracking-tighter uppercase text-[#111]">Team</h2>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Search staff members..."
              className="h-10 pl-11 pr-4 bg-white border-[1.5px] border-[#111] rounded-full focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-xs font-bold w-64 text-[#111] placeholder:text-zinc-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="h-10 bg-[#111] text-white border-[1.5px] border-[#111] font-black text-xs px-6 hover:bg-primary hover:text-white rounded-full transition-all uppercase shadow-sm">
                Add Member
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-background border-[#111] border-[1.5px] rounded-[2rem] p-8 max-w-md">
              <DialogHeader>
                <DialogTitle className="text-3xl font-black tracking-tighter uppercase text-[#111]">
                  Add Member
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-6 mt-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black tracking-widest uppercase text-zinc-500">Email</label>
                  <Input 
                    placeholder="user@thorx.com" 
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                    className="bg-white border-[1.5px] border-[#111] rounded-full font-bold h-12 px-4 focus-visible:ring-primary" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black tracking-widest uppercase text-zinc-500">Access</label>
                  <select 
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value)}
                    className="flex h-12 w-full items-center justify-between rounded-full border-2 border-[#111] bg-zinc-200 px-4 text-sm font-black uppercase text-[#111] outline-none focus:ring-0 cursor-pointer shadow-sm hover:bg-zinc-300 transition-colors"
                  >
                    <option value="team">Regular</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                {newMemberRole === 'team' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black tracking-widest uppercase text-zinc-500 mb-1 block">Initial Access matrix</label>
                    <div className="grid grid-cols-2 gap-2">
                      {ADMIN_SECTIONS.map(section => (
                        <div 
                          key={section.id} 
                          className={cn(
                            "flex items-center gap-2 p-2 border-2 rounded-lg cursor-pointer transition-colors",
                            newMemberPermissions.includes(section.id) ? "border-[#111] bg-black/5" : "border-[#111]/20 hover:border-[#111]"
                          )}
                          onClick={() => setNewMemberPermissions(prev => prev.includes(section.id) ? prev.filter(p => p !== section.id) : [...prev, section.id])}
                        >
                           <Checkbox 
                             checked={newMemberPermissions.includes(section.id)}
                             className="border-2 border-[#111] data-[state=checked]:bg-[#111] data-[state=checked]:text-zinc-200 data-[state=checked]:border-[#111]"
                           />
                           <label className="text-[9px] font-black text-[#111] uppercase tracking-tight pointer-events-none">
                             {section.name}
                           </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <Button 
                  disabled={addMemberMutation.isPending || !newMemberEmail.trim()}
                  onClick={() => addMemberMutation.mutate({ email: newMemberEmail, role: newMemberRole, permissions: newMemberRole === 'team' ? newMemberPermissions : [] })}
                  className="w-full h-12 bg-primary text-white border-[1.5px] border-[#111] font-black text-xs rounded-full hover:bg-primary/80 transition-colors uppercase disabled:opacity-50"
                >
                  {addMemberMutation.isPending
                    ? <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating Token…</span>
                    : "Process Key Issuance"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="bg-background border-[1.5px] border-[#111] rounded-[2rem] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/50 border-b-[1.5px] border-[#111]/10">
                <th className="p-6 font-black text-[10px] tracking-widest text-[#111]/40 uppercase">MEMBER</th>
                <th className="p-6 font-black text-[10px] tracking-widest text-[#111]/40 uppercase text-center w-20">ACCESS</th>
                <th className="p-6 font-black text-[10px] tracking-widest text-[#111]/40 uppercase">RANK</th>
                <th className="p-6 font-black text-[10px] tracking-widest text-[#111]/40 uppercase">LAST SEEN</th>
                <th className="p-6 font-black text-[10px] tracking-widest text-[#111]/40 uppercase text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y-[1.5px] divide-[#111]/10">
              {filtered.map((member) => [
                  <tr key={`${member.id}-row`} className="hover:bg-black/5 transition-colors group">
                    <td className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white border-[1.5px] border-[#111]/20 flex items-center justify-center rounded-full group-hover:bg-primary/20 group-hover:border-primary transition-colors shadow-sm">
                          <User className="w-5 h-5 text-zinc-400 group-hover:text-primary transition-colors" />
                        </div>
                        <div>
                          <div className="font-black text-sm uppercase text-[#111] tracking-tight mb-0.5">{member.name}</div>
                          <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{member.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-6 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-10 w-10 border-[1.5px] rounded-full transition-all",
                          expandedMemberId === member.id ? "bg-primary border-[#111] text-white" : "border-[#111]/20 text-zinc-400"
                        )}
                        onClick={() => setExpandedMemberId(expandedMemberId === member.id ? null : member.id)}
                      >
                        {expandedMemberId === member.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </Button>
                    </td>
                    <td className="p-6">
                      {member.accessLevel === 'founder' ? (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 border-2 border-[#111] bg-zinc-200 rounded-full font-black text-[9px] tracking-widest uppercase shadow-sm text-[#111]">
                          <Shield size={12} />
                          Founder
                        </div>
                      ) : (
                        <div className="relative inline-flex">
                          <select 
                            value={member.accessLevel}
                            onChange={(e) => updateRoleMutation.mutate({ id: member.id, accessLevel: e.target.value })}
                            disabled={member.id === currentUser?.id || updateRoleMutation.isPending}
                            className={cn(
                              "appearance-none inline-flex items-center gap-1.5 px-3 py-1 border-2 border-[#111] bg-zinc-200 rounded-full font-black text-[9px] tracking-widest uppercase shadow-sm text-[#111] outline-none cursor-pointer hover:bg-zinc-300 transition-colors pr-6"
                            )}
                          >
                            <option value="admin">Admin</option>
                            <option value="team">Regular</option>
                          </select>
                          <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#111]" />
                        </div>
                      )}
                    </td>
                    <td className="p-6">
                       <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">
                        <Clock size={12} className="text-[#111]/30" />
                        {member.lastUsed ? (
                          <span>{new Date(member.lastUsed).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        ) : 'Never'}
                      </div>
                    </td>
                    <td className="p-6 text-right">
                      <div className="flex items-center justify-end gap-3">
                         <div className={cn("inline-flex items-center gap-1.5 px-3 py-1 border-2 border-[#111] bg-zinc-200 rounded-full font-black text-[9px] tracking-widest uppercase shadow-sm text-[#111] mr-2", !member.isActive && "opacity-50 line-through")}>
                          {member.isActive ? 'ACTIVE' : 'NOT ACTIVE'}
                        </div>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-10 w-10 border-[1.5px] border-[#111] hover:bg-black/5 rounded-full transition-all text-[#111]"
                          onClick={() => updateStatusMutation.mutate({ id: member.id, isActive: !member.isActive })}
                          disabled={member.id === currentUser?.id}
                        >
                           {member.isActive ? <Lock size={14} /> : <Unlock size={14} />}
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-10 w-10 border-[1.5px] border-[#111] hover:bg-red-500 hover:text-white hover:border-red-600 rounded-full transition-all text-[#111] shadow-sm"
                          onClick={() => {
                            if (confirm("Permanently destroy node and revoke key?")) deleteMemberMutation.mutate(member.id);
                          }}
                          disabled={member.id === currentUser?.id}
                        >
                           <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>,
                  expandedMemberId === member.id && (
                    <tr key={`${member.id}-expanded`} className="bg-black/[0.02] border-b-[1.5px] border-[#111]/10 animate-in slide-in-from-top-2 duration-200">
                      <td colSpan={5} className="p-8">
                        <div className="max-w-4xl mx-auto">
                          <div className="flex items-center justify-between mb-6">
                            <div>
                              <h3 className="text-xl font-black uppercase text-[#111] tracking-tight">{member.name}</h3>
                            </div>
                            
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2 mr-4">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="inline-flex items-center gap-1.5 px-4 py-1 border-2 border-[#111] bg-zinc-200 rounded-full font-black text-[9px] tracking-widest uppercase shadow-sm text-[#111] hover:bg-zinc-300 transition-all h-8"
                                  onClick={() => handleToggleAllPermissions(member, true)}
                                  disabled={updatePermissionsMutation.isPending || member.accessLevel !== 'team' || currentUser?.role !== 'founder'}
                                >
                                  SELECT ALL
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="inline-flex items-center gap-1.5 px-4 py-1 border-2 border-[#111] bg-zinc-200 rounded-full font-black text-[9px] tracking-widest uppercase shadow-sm text-[#111] hover:bg-zinc-300 transition-all h-8"
                                  onClick={() => handleToggleAllPermissions(member, false)}
                                  disabled={updatePermissionsMutation.isPending || member.accessLevel !== 'team' || currentUser?.role !== 'founder'}
                                >
                                  REMOVE ALL
                                </Button>
                              </div>
                            </div>
                          </div>
                          
                          {member.accessLevel === 'team' ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                              {/* Always Active Dashboard Protocol */}
                              <div className="p-4 border-[1.5px] rounded-2xl flex items-center justify-between transition-all bg-zinc-50 border-[#111]/10 opacity-60">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full flex items-center justify-center bg-zinc-200 text-zinc-500">
                                    <LayoutDashboard size={14} />
                                  </div>
                                  <span className="text-[11px] font-black uppercase tracking-tight text-[#111]">Dashboard Sync</span>
                                </div>
                                <div className="px-2 py-0.5 bg-zinc-200 text-zinc-600 rounded font-black text-[7px] tracking-widest uppercase">Fundamental</div>
                              </div>

                              {ADMIN_SECTIONS.map((section) => (
                                <div 
                                  key={section.id} 
                                  className={cn(
                                    "p-4 border-[1.5px] rounded-2xl flex items-center justify-between transition-all cursor-pointer group/perm",
                                    member.permissions?.includes(section.id) 
                                      ? "bg-white border-primary shadow-md" 
                                      : "bg-white/50 border-[#111]/10 opacity-70 hover:opacity-100 hover:border-[#111]/20"
                                  )}
                                  onClick={() => currentUser?.role === 'founder' && handlePermissionToggle(member, section.id)}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={cn(
                                      "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                                      member.permissions?.includes(section.id) ? "bg-primary/10 text-primary" : "bg-zinc-100 text-zinc-400"
                                    )}>
                                      <Activity size={14} />
                                    </div>
                                    <span className="text-[11px] font-black uppercase tracking-tight text-[#111]">{section.name}</span>
                                  </div>
                                    <Checkbox 
                                      checked={member.permissions?.includes(section.id)}
                                      disabled={currentUser?.role !== 'founder'}
                                      className="border-2 border-[#111] data-[state=checked]:bg-[#111] data-[state=checked]:text-zinc-200 data-[state=checked]:border-[#111]"
                                    />
                                </div>
                              ))}
                            </div>
                          ) : (
                                <div className="p-12 border-2 border-[#111] rounded-3xl flex flex-col items-center justify-center text-center bg-zinc-200 shadow-sm">
                                 <Shield size={48} className="text-[#111] mb-4" />
                                 <div className="text-sm font-black uppercase tracking-tight text-[#111] mb-2">Full Access</div>
                                 <p className="text-[10px] font-bold text-[#111]/70 uppercase tracking-widest max-w-sm leading-relaxed">
                                   Founder nodes have full access to all functions and features of THORX.
                                 </p>
                                </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
              ])}
              {filtered.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={5} className="p-16 text-center text-zinc-400 font-bold text-[11px] uppercase tracking-widest italic">
                    No registry match found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
