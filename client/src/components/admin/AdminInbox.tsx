import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { 
  Search, 
  Inbox, 
  ChevronRight, 
  Copy,
  Archive,
  ArchiveRestore,
  Trash2,
  Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import TechnicalLabel from "@/components/ui/technical-label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Email {
  id: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  content: string;
  type: 'inbound' | 'outbound';
  status: string;
  createdAt: string;
  fromUserRank?: string | null;
}

export function AdminInbox() {
  const [selectedMessage, setSelectedMessage] = useState<Email | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<'active' | 'archived'>('active');
  const [sortType, setSortType] = useState<'latest' | 'rank' | 'deadtime'>('latest');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ emails: Email[] }>({
    queryKey: ['/api/team/emails'],
  });

  const updateMessageMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: string }) => {
      const res = await apiRequest("PATCH", `/api/team/emails/${id}`, { status });
      return await res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/team/emails'] });
      if (variables.status === 'archived') {
        toast({ title: "Thread Archived", description: "Correspondence moved to cold storage." });
        setSelectedMessage(null);
      } else if (variables.status === 'read') {
        // Just refresh the data to show read state
      } else {
        toast({ title: "Status Updated", description: `Correspondence status set to ${variables.status}.` });
      }
    }
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/team/emails/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/team/emails'] });
      toast({ title: "Correspondence Deleted", description: "The record has been permanently removed." });
      setSelectedMessage(null);
    }
  });

  const emails = data?.emails || [];
  
  const rankPriority: Record<string, number> = {
    "CHACHA SUPREME": 1,
    "HAJI SAAB": 2,
    "BAWA JI": 3,
    "MUNNA": 4,
    "NAWA AYA": 5,
  };

  const getDeadtimeLeft = (createdAt: string) => {
    const deadline = new Date(createdAt).getTime() + 48 * 60 * 60 * 1000;
    const timeLeft = deadline - Date.now();
    return timeLeft;
  };

  const formattedTimeLeft = (ms: number) => {
    if (ms <= 0) return "EXPIRED";
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m`;
  };

  const filtered = emails
    .filter(e => {
      const matchesSearch = 
        e.subject.toLowerCase().includes(searchTerm.toLowerCase()) || 
        e.fromEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.content.toLowerCase().includes(searchTerm.toLowerCase());
      
      const status = (e.status || 'sent').toLowerCase();
      if (activeFilter === 'archived') return matchesSearch && status === 'archived';
      return matchesSearch && status !== 'archived'; 
    })
    .sort((a, b) => {
      if (sortType === 'rank') {
        const pA = rankPriority[a.fromUserRank?.toUpperCase() || "NAWA AYA"] || 6;
        const pB = rankPriority[b.fromUserRank?.toUpperCase() || "NAWA AYA"] || 6;
        if (pA !== pB) return pA - pB;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortType === 'deadtime') {
        return getDeadtimeLeft(a.createdAt) - getDeadtimeLeft(b.createdAt);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const copyEmail = (email: string) => {
    navigator.clipboard.writeText(email).then(() => {
      toast({ title: "Copied", description: "Email address copied to clipboard." });
    }).catch(() => {
      toast({ title: "Copy failed", variant: "destructive" });
    });
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black tracking-tighter uppercase text-[#141413]">INBOX</h2>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Search correspondence..."
              className="h-10 pl-11 pr-4 bg-white border-[1.5px] border-[#141413] rounded-full focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-xs font-bold w-64 text-[#141413] placeholder:text-zinc-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-250px)]">
        {/* Message List */}
        <div className="lg:col-span-4 bg-background border-[1.5px] border-[#141413] rounded-[2rem] flex flex-col overflow-hidden shadow-sm">
          <div className="p-6 bg-white border-b-[1.5px] border-[#141413]/10 flex flex-col gap-4">
            {/* Filter Tabs & Sorting */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-1 bg-[#141413]/5 p-1 rounded-full">
                {(['active', 'archived'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setActiveFilter(f)}
                    className={cn(
                      "flex-1 py-1.5 px-3 rounded-full text-[9px] font-black uppercase tracking-widest transition-all min-w-[80px]",
                      activeFilter === f ? "bg-black text-white shadow-sm" : "hover:bg-black/10 text-zinc-400"
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 w-full overflow-hidden">
                {(['latest', 'rank', 'deadtime'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSortType(s)}
                    className={cn(
                      "flex-1 py-1.5 border-[1.5px] text-[8px] font-black uppercase tracking-widest transition-all",
                      sortType === s 
                        ? "bg-[#141413] text-white border-black" 
                        : "bg-transparent border-[#141413]/10 text-zinc-400 hover:bg-black/5 hover:border-[#141413]/30"
                    )}
                  >
                    {s.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y-4 divide-[#141413]">
            {filtered.map((email, idx) => (
              <button
                key={email.id}
                onClick={() => {
                  setSelectedMessage(email);
                  // Protect archived status from being overwritten by 'read'
                  if (email.status !== 'read' && email.status !== 'archived') {
                    updateMessageMutation.mutate({ id: email.id, status: 'read' });
                  }
                }}
                className={cn(
                  "w-full p-6 text-left transition-all duration-300 ease-out group flex gap-6 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                  selectedMessage?.id === email.id ? "bg-[#141413]/5" : "hover:bg-white",
                  email.status === 'sent' && email.type === 'inbound' && "bg-primary/5"
                )}
              >
                {/* Visual Numbering Vertical Divider */}
                <div className="flex flex-col items-center justify-center pr-6 border-r-2 border-[#141413]/10 min-w-[60px]">
                   <span className="text-2xl font-black text-[#141413]/30 group-hover:text-primary transition-colors italic leading-none">
                     {(idx + 1).toString().padStart(2, '0')}
                   </span>
                </div>

                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {sortType === 'deadtime' && (
                        <span className={cn(
                          "text-[9px] font-black px-2 py-0.5 rounded-none border-2 uppercase tracking-tighter shadow-sm",
                          getDeadtimeLeft(email.createdAt) < 3600000 
                            ? "bg-red-500 text-white border-black animate-pulse" 
                            : "bg-white text-black border-black/80"
                        )}>
                          {formattedTimeLeft(getDeadtimeLeft(email.createdAt))}
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">{new Date(email.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <div className="font-black text-sm group-hover:text-primary transition-colors truncate uppercase text-[#141413] leading-tight mb-0.5">
                      {email.subject.replace(/Contact message from /i, '')}
                    </div>
                    <div className="text-[10px] font-bold text-zinc-500 truncate uppercase tracking-widest flex items-center gap-2">
                      <span className="text-[#141413]/60">{email.fromEmail}</span>
                      {email.fromUserRank && (
                        <>
                          <span className="w-1.5 h-[1.5px] bg-zinc-300" />
                          <span className="text-primary font-black italic tracking-tighter">{email.fromUserRank}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
            {filtered.length === 0 && !isLoading && (
              <div className="p-16 text-center text-zinc-400 font-bold text-[11px] uppercase tracking-widest">
                <Inbox className="w-10 h-10 mx-auto mb-4 opacity-20" />
                No messages found
              </div>
            )}
          </div>
        </div>

        {/* Message View */}
        <div className="lg:col-span-8 bg-background border-[1.5px] border-[#141413] rounded-[2rem] flex flex-col overflow-hidden shadow-sm">
          {selectedMessage ? (
            <>
              <div className="p-8 border-b-[1.5px] border-[#141413]/10 flex items-start justify-between bg-white relative">
                <div className="space-y-6">
                  <div>
                    <TechnicalLabel text="SUBJECT" className="text-zinc-400 mb-2 text-[9px] tracking-widest" />
                    <h3 className="text-2xl font-black tracking-tight uppercase text-[#141413]">
                      {selectedMessage.subject.replace(/Contact message from /i, '')}
                    </h3>
                  </div>
                  
                  <div className="flex flex-wrap gap-8">
                    <div>
                      <TechnicalLabel text="EMAIL" className="text-zinc-400 mb-1.5 text-[9px] tracking-widest" />
                      <div className="flex items-center gap-3 bg-zinc-500 border-2 border-black px-3 py-1.5 rounded-none w-fit shadow-sm">
                        <span className="font-black text-[10px] uppercase text-black tracking-tight">{selectedMessage.fromEmail}</span>
                        <Button onClick={() => copyEmail(selectedMessage.fromEmail)} size="sm" variant="ghost" className="h-4 w-4 p-0 rounded-none hover:bg-black hover:text-white text-black transition-colors">
                          <Copy size={10} />
                        </Button>
                      </div>
                    </div>
                    <div>
                      <TechnicalLabel text="PERIOD" className="text-zinc-400 mb-1.5 text-[9px] tracking-widest" />
                      <div className="flex items-center font-black text-[10px] uppercase text-black bg-zinc-500 border-2 border-black px-3 py-1.5 rounded-none w-fit shadow-sm">
                        {new Date(selectedMessage.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                   {selectedMessage.status === 'archived' ? (
                     <Button 
                      onClick={() => {
                        updateMessageMutation.mutate({ id: selectedMessage.id, status: 'read' });
                        toast({ title: "Thread Restored", description: "Correspondence moved back to active directory." });
                        setSelectedMessage(null);
                      }}
                      variant="ghost" 
                      className="h-10 w-10 bg-black text-white flex items-center justify-center rounded-none hover:bg-zinc-800 transition-all shadow-sm"
                      title="Unarchive"
                    >
                      <ArchiveRestore size={18} />
                    </Button>
                   ) : (
                     <Button 
                      onClick={() => {
                        updateMessageMutation.mutate({ id: selectedMessage.id, status: 'archived' });
                      }}
                      variant="ghost" 
                      className="h-10 w-10 bg-black text-white flex items-center justify-center rounded-none hover:bg-zinc-800 transition-all shadow-sm"
                      title="Archive"
                    >
                      <Archive size={18} />
                    </Button>
                   )}

                   <Button 
                    onClick={() => {
                      if (confirm("Permanently delete this correspondence record? This action cannot be undone.")) {
                        deleteMessageMutation.mutate(selectedMessage.id);
                      }
                    }}
                    variant="ghost" 
                    className="h-10 w-10 bg-red-600 text-white flex items-center justify-center rounded-none hover:bg-red-700 transition-all shadow-sm"
                    title="Delete Permanently"
                  >
                    <Trash2 size={18} />
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-10 font-mono text-[14px] leading-relaxed bg-transparent text-[#141413]">
                <div className="max-w-3xl whitespace-pre-wrap">
                  {selectedMessage.content.includes("Message:") 
                    ? selectedMessage.content.split("Message:")[1].trim() 
                    : selectedMessage.content}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-transparent">
              <Inbox className="w-16 h-16 mb-6 text-[#141413]/10" />
              <div className="text-2xl font-black tracking-tighter mb-2 text-[#141413]/40 uppercase">Awaiting Selection</div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Select correspondence to initialize review protocol</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
