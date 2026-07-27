import { useState, useEffect, useRef } from "react";
import { X, Check, ChevronRight, Play as PlayIcon, Bell, Twitter, Disc as Discord, Send, Instagram, Youtube, Lock, Target as TargetIcon, Globe, ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { QUERY_KEYS } from "@/lib/queryKeys";
// DailyTask / TaskRecord types — inline stubs (daily_tasks system retired)
type DailyTask = { id: string; title: string; type: string; actionUrl?: string | null; secretCode?: string | null; instructions?: string | null; targetRank?: string | null; grossPkrPerCompletion?: string | null; isActive?: boolean | null; isMandatory?: boolean | null; taskCategory?: string | null };
type TaskRecord = { id: string; userId: string; taskId: string; status?: string | null; clickedAt?: Date | null; completedAt?: Date | null };
import { motion, AnimatePresence } from "framer-motion";

interface DailyGoalModalProps {
    isOpen: boolean;
    onClose: () => void;
    adsWatched: number;
    adsTarget: number;
    cpaCount: number;
    cpaTarget: number;
}

type TaskWithRecord = {
    task: DailyTask;
    record: TaskRecord | null;
};

export function DailyGoalModal({
    isOpen,
    onClose,
    adsWatched,
    adsTarget,
    cpaCount,
    cpaTarget,
}: DailyGoalModalProps) {
    const [videoCodes, setVideoCodes] = useState<Record<string, string>>({});
    const [isVisible, setIsVisible] = useState(false);
    const [codeErrors, setCodeErrors] = useState<Record<string, boolean>>({});
    const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const taskListRef = useRef<HTMLDivElement>(null);

    const { data: tasksWithRecords, isLoading } = useQuery<TaskWithRecord[]>({
        queryKey: ['/api/tasks'],
        enabled: isOpen,
    });

    // Handle scroll into view when task expands
    useEffect(() => {
        if (expandedTaskId) {
            const element = document.getElementById(`task-anchor-${expandedTaskId}`);
            if (element) {
                setTimeout(() => {
                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 300);
            }
        }
    }, [expandedTaskId]);

    const clickMutation = useMutation({
        mutationFn: async (taskId: string) => {
            const res = await apiRequest("POST", `/api/tasks/${taskId}/click`);
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.earnings });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessionAuth });
        }
    });

    const verifyMutation = useMutation({
        mutationFn: async ({ taskId, code }: { taskId: string, code: string }) => {
            const res = await apiRequest("POST", `/api/tasks/${taskId}/verify`, { code });
            return res.json();
        },
        onSuccess: (data) => {
            if (data.success) {
                queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
                // Invalidate earnings + session in case task completion awarded points.
                queryClient.invalidateQueries({ queryKey: QUERY_KEYS.earnings });
                queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessionAuth });
                toast({
                    title: "Access Granted",
                    description: "Secret code verified. Requirement met.",
                });
                setExpandedTaskId(null);
            } else if (data.message === "VERIFICATION_FAILED_TIME") {
                toast({
                    title: "Verification Failed",
                    description: data.details || "Wait a bit longer before verifying.",
                    variant: "destructive"
                });
            } else {
                toast({
                    title: "Verification Failed",
                    description: data.details || "Invalid secret code.",
                    variant: "destructive"
                });
            }
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: "Failed to verify task.",
                variant: "destructive"
            });
        }
    });

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
            document.body.style.overflow = "hidden";
        } else {
            setIsVisible(false);
            document.body.style.overflow = "auto";
            setExpandedTaskId(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleTaskClick = (task: DailyTask, record: TaskRecord | null) => {
        if (record?.status === 'completed') return;
        
        // Record the click first
        clickMutation.mutate(task.id);

        if (task.actionUrl) {
            window.open(task.actionUrl, '_blank');
        }
    };

    const handleCodeSubmit = (taskId: string) => {
        const code = videoCodes[taskId];
        if (!code) return;
        verifyMutation.mutate({ taskId, code });
    };

    const toggleAccordion = (taskId: string) => {
        setExpandedTaskId(prev => prev === taskId ? null : taskId);
    };

    const getTaskInstructions = (task: DailyTask) => {
        if (task.instructions) return task.instructions;

        switch (task.type) {
            case 'video': return "Click 'GO' to watch the video. Pay attention to the secret code hidden somewhere in the video or description, then enter it below to complete the task.";
            case 'social': return "Visit the link and follow the on-page instructions (e.g., Join our channel or Follow). Stay on the page for a few seconds first to ensure the tracking system registers your visit.";
            default: return "Navigate to the link using the 'GO' button below and follow any localized instructions on the target page. Once finished, your status will be automatically updated.";
        }
    };

    const getTypeIcon = (type: string | null) => {
        switch (type) {
            case 'video': return Youtube;
            case 'social': return Send;
            case 'payout-ads': return PlayIcon;
            case 'payout-cpa': return TargetIcon;
            default: return Globe;
        }
    };

    // Calculate progress
    const adsCompleted = adsWatched >= adsTarget;
    const cpaCompleted = cpaCount >= cpaTarget;
    const dynamicTasks = tasksWithRecords || [];
    const completedDynamicCount = dynamicTasks.filter(tr => tr.record?.status === 'completed').length;
    
    // total = dynamic tasks + ads quota + cpa quota
    const totalCount = dynamicTasks.length + 1 + (cpaTarget > 0 ? 1 : 0);
    const completedCount = completedDynamicCount + (adsCompleted ? 1 : 0) + (cpaCompleted && cpaTarget > 0 ? 1 : 0);
    const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 100;

    return (
        <div
            className={cn(
                "fixed inset-0 z-goal bg-black text-white transition-opacity duration-500 ease-out overflow-y-auto overflow-x-hidden custom-scrollbar",
                isVisible ? "opacity-100" : "opacity-0"
            )}
        >
            {/* Top Loading Line */}
            <div className="absolute top-0 left-0 w-full h-1 bg-white/5 z-50">
                <div
                    className="h-full bg-primary ease-out transition-all duration-1000"
                    style={{ width: isVisible ? `${progress}%` : '0%' }}
                />
            </div>

            {/* Close Button */}
            <Button
                variant="ghost"
                onClick={onClose}
                className="fixed md:absolute top-4 right-4 md:top-8 md:right-8 z-[200] text-white/40 hover:text-white hover:bg-white/10 rounded-full w-12 h-12 p-0 transition-all duration-300 hover:rotate-90 bg-black/50 backdrop-blur-md"
            >
                <X className="w-6 h-6" />
            </Button>

            <div className="w-full max-w-7xl mx-auto min-h-full flex flex-col pt-16 md:pt-20 px-4 md:px-8 pb-32">

                {/* Header */}
                <div className={cn(
                    "mb-8 md:mb-12 transition-all duration-700 delay-100 transform",
                    isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                )}>
                    <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter text-white mb-2">
                        Today's Goals
                    </h1>
                    <p className="text-white/40 text-[10px] md:text-sm font-bold uppercase tracking-widest leading-relaxed">
                        Complete all tasks to unlock the payout.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 content-start">

                    {/* Left Sidebar Status */}
                    <div className={cn(
                        "md:col-span-3 lg:col-span-4 transition-all duration-700 delay-200 transform",
                        isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                    )}>
                        <div className="static md:sticky md:top-32 bg-white/5 p-6 md:p-0 rounded-2xl md:bg-transparent">
                            <span className="text-5xl md:text-9xl font-black tracking-tighter text-white block leading-none mb-4">
                                {Math.round(progress)}%
                            </span>
                            <div className="h-2 w-full bg-white/5 my-4 md:my-6 overflow-hidden">
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    className="h-full bg-zinc-400"
                                />
                            </div>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center py-2 md:py-3 border-b border-white/5">
                                    <span className="text-white/40 text-[9px] md:text-xs font-bold uppercase tracking-widest">Daily Tasks</span>
                                    <span className="font-black text-xs md:text-base text-zinc-400">{completedCount} / {totalCount}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Task List - Single Column List */}
                    <div className="md:col-span-9 lg:col-span-8 flex flex-col gap-6" ref={taskListRef}>
                        
                        {/* 1. Watch Daily Ads Requirement */}
                        <div id="task-anchor-payout-ads">
                            <AccordionTask 
                                id="payout-ads"
                                index={1}
                                title={`Complete ${adsTarget} Engine A tasks`}
                                statusText={`${adsWatched} / ${adsTarget}`}
                                isCompleted={adsCompleted}
                                isExpanded={expandedTaskId === 'payout-ads'}
                                onToggle={() => toggleAccordion('payout-ads')}
                                instructions={`Go to Work section, then Engine A, and complete ${adsTarget} Engine A (Video Ads) tasks to complete this daily task for today.`}
                                isVisible={isVisible}
                                type="payout-ads"
                                isMandatory={true}
                            />
                        </div>

                        {/* 2. CPA Requirement if applicable */}
                        {cpaTarget > 0 && (
                            <div id="task-anchor-payout-cpa">
                                <AccordionTask 
                                    id="payout-cpa"
                                    index={2}
                                    title={`Complete ${cpaTarget} Engine B tasks`}
                                    statusText={`${cpaCount} / ${cpaTarget}`}
                                    isCompleted={cpaCompleted}
                                    isExpanded={expandedTaskId === 'payout-cpa'}
                                    onToggle={() => toggleAccordion('payout-cpa')}
                                    instructions={`Go to Work section, then Engine B (CPA Tasks), and complete ${cpaTarget} Engine B (CPA tasks) to complete this daily task for today.`}
                                    isVisible={isVisible}
                                    type="payout-cpa"
                                    isMandatory={true}
                                />
                            </div>
                        )}

                        {/* Dynamic Tasks mapping */}
                        {dynamicTasks.map((tr, index) => {
                            const { task, record } = tr;
                            const isCompleted = record?.status === 'completed';
                            const globalIndex = cpaTarget > 0 ? index + 3 : index + 2;

                            return (
                                <div key={task.id} id={`task-anchor-${task.id}`}>
                                    <AccordionTask 
                                        id={task.id}
                                        index={globalIndex}
                                        title={task.title}
                                        statusText={isCompleted ? "COMPLETED" : "PENDING"}
                                        isCompleted={isCompleted}
                                        isExpanded={expandedTaskId === task.id}
                                        onToggle={() => toggleAccordion(task.id)}
                                        instructions={getTaskInstructions(task)}
                                        actionUrl={task.actionUrl}
                                        secretCodeRequired={!!task.secretCode}
                                        secretCodeValue={videoCodes[task.id] || ""}
                                        onSecretCodeChange={(val: string) => setVideoCodes(prev => ({ ...prev, [task.id]: val }))}
                                        onVerify={() => handleCodeSubmit(task.id)}
                                        onGo={() => handleTaskClick(task, record)}
                                        isGoLoading={clickMutation.isPending}
                                        isVerifyLoading={verifyMutation.isPending}
                                        isVisible={isVisible}
                                        type={task.type}
                                        delay={350 + (index * 50)}
                                        isMandatory={task.isMandatory || false}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

// Subcomponent for the Accordion Task Item
function AccordionTask({ 
    id, index, title, statusText, isCompleted, isExpanded, onToggle, 
    instructions, actionUrl, secretCodeRequired, secretCodeValue, 
    onSecretCodeChange, onVerify, onGo, isMandatory, isVisible, type, delay = 300,
    isGoLoading = false, isVerifyLoading = false,
}: any) {
    const TypeIcon = id === 'payout-ads' ? PlayIcon : (id === 'payout-cpa' ? TargetIcon : (type === 'video' ? Youtube : (type === 'social' ? Send : Globe)));

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={isVisible ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.5, delay: delay / 1000 }}
            className={cn(
                "w-full border-4 border-black transition-all duration-300 overflow-hidden",
                isCompleted ? "bg-zinc-400/30 opacity-60 grayscale-[0.5]" : "bg-zinc-400 shadow-[6px_6px_0px_#000]",
                isExpanded ? "scale-[1.01]" : "hover:scale-[1.005]"
            )}
        >
            {/* Header Row */}
            <div 
                onClick={onToggle}
                className="flex items-center justify-between p-4 md:p-6 cursor-pointer group"
            >
                <div className="flex items-center gap-4 md:gap-6 flex-grow">
                    <span className="font-black text-black/20 text-xs md:text-sm font-mono shrink-0">
                        {index.toString().padStart(2, '0')}
                    </span>
                    <div className="flex-grow">
                        <div className="flex flex-wrap items-center gap-3">
                            <h3 className={cn(
                                "text-sm md:text-lg font-black uppercase tracking-tight text-black",
                                isCompleted && "line-through opacity-50"
                            )}>
                                {title}
                            </h3>
                            {isMandatory && !isCompleted && (
                                <span className="bg-black text-white text-[10px] md:text-xs font-black px-3 py-1 uppercase tracking-widest">REQUIRED</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4 md:gap-6 shrink-0 ml-4">
                    <div className="hidden sm:block text-right">
                        <p className="text-[10px] font-black text-black/40 uppercase tracking-widest leading-none mb-1">Status</p>
                        <p className={cn("text-xs font-black uppercase", isCompleted ? "text-green-800" : "text-black")}>{statusText}</p>
                    </div>
                    <Button 
                        onClick={(e) => { e.stopPropagation(); onToggle(); }}
                        className="bg-black hover:bg-zinc-800 text-white font-black text-[10px] md:text-xs uppercase px-4 md:px-6 h-10 md:h-12 rounded-none border-2 border-black"
                    >
                        {isExpanded ? "CLOSE" : "ENTER"}
                    </Button>
                </div>
            </div>

            {/* Expanded Content */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        className="border-t-4 border-black bg-white/50 backdrop-blur-md"
                    >
                        <div className="p-6 md:p-10">
                            <div className="flex flex-col lg:flex-row gap-8 lg:gap-16">
                                <div className="flex-1">
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-12 h-12 bg-black flex items-center justify-center">
                                            <TypeIcon className="w-6 h-6 text-white" />
                                        </div>
                                        <h4 className="text-xl md:text-2xl font-black text-black uppercase tracking-tighter">
                                            How to complete
                                        </h4>
                                    </div>
                                    <p className="text-black/70 text-sm md:text-base font-bold leading-relaxed mb-8 border-l-4 border-black/10 pl-6 py-2">
                                        {instructions}
                                    </p>
                                </div>

                                <div className="flex-1 flex flex-col justify-center gap-6">
                                    {secretCodeRequired && !isCompleted && (
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-black uppercase tracking-widest">Secret Protocol Code</label>
                                            <div className="flex gap-2">
                                                <Input 
                                                    value={secretCodeValue}
                                                    onChange={(e) => onSecretCodeChange(e.target.value)}
                                                    placeholder="ENTER CODE"
                                                    className="h-12 md:h-14 bg-white border-2 border-black rounded-none px-6 font-black text-black placeholder:text-black/20 focus-visible:ring-offset-0 focus-visible:ring-black uppercase"
                                                />
                                                <Button 
                                                    onClick={onVerify}
                                                    disabled={isVerifyLoading}
                                                    className="h-12 md:h-14 px-6 md:px-8 bg-black hover:bg-zinc-800 text-white rounded-none font-black uppercase text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {isVerifyLoading ? "Verifying…" : "Verify"}
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-4">
                                        {!isCompleted && id !== 'payout-ads' && id !== 'payout-cpa' && (
                                            <Button 
                                                onClick={onGo}
                                                disabled={isGoLoading}
                                                className="flex-1 h-14 md:h-16 bg-black hover:bg-zinc-800 text-white rounded-none font-black uppercase tracking-widest text-xs md:text-sm flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isGoLoading ? "Opening…" : "Go to Link"}
                                                <ExternalLink className="w-4 h-4" />
                                            </Button>
                                        )}
                                        {isCompleted && (
                                            <div className="w-full h-14 md:h-16 bg-green-100 border-2 border-green-800 flex items-center justify-center gap-3">
                                                <Check className="w-5 h-5 text-green-800" />
                                                <span className="font-black text-green-800 uppercase tracking-widest text-xs md:text-sm">Completed</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
