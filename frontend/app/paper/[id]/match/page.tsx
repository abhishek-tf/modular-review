'use client';

import React, { useState, useEffect } from 'react';
import {
    ArrowLeft, CheckCircle2, AlertTriangle, Send,
    ExternalLink, Activity, BookOpen, ShieldCheck,
    Search, UserPlus, Loader2, ChevronRight
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

export default function ReviewerMatchingView() {
    const params = useParams();
    const router = useRouter();
    const paperId = params.id as string;

    // Real state
    const [components, setComponents] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<string | null>(null);
    const [candidates, setCandidates] = useState<any[]>([]);

    // Loading states
    const [isLoadingInit, setIsLoadingInit] = useState(true);
    const [isLoadingMatches, setIsLoadingMatches] = useState(false);
    const [isSending, setIsSending] = useState(false);

    // Invite state tracking
    const [invited, setInvited] = useState<Record<string, boolean>>({});
    // NEW: Tracks invites using a composite key: "componentId_researcherId"
    const [sentInvites, setSentInvites] = useState<Record<string, boolean>>({});

    // 1. Fetch the paper's components and existing invites on load
    useEffect(() => {
        async function fetchData() {
            try {
                // Fetch Components
                const compRes = await fetch(`http://localhost:8000/api/v1/papers/${paperId}/details`);
                const compData = await compRes.json();
                if (compData.success && compData.components && compData.components.length > 0) {
                    setComponents(compData.components);
                    setActiveTab(compData.components[0].id); // Select first tab automatically
                }

                // Fetch Existing Invites from the Tracking Endpoint
                const trackRes = await fetch(`http://localhost:8000/api/v1/papers/${paperId}/track`, { cache: 'no-store' });
                const trackData = await trackRes.json();
                if (trackData.success && trackData.components) {
                    const previouslyInvited: Record<string, boolean> = {};
                    trackData.components.forEach((comp: any) => {
                        (comp.invites || []).forEach((inv: any) => {
                            // Lock out this researcher ONLY for this specific component!
                            previouslyInvited[`${comp.id}_${inv.researcher_id}`] = true;
                        });
                    });
                    setSentInvites(previouslyInvited);
                }

            } catch (error) {
                console.error("Failed to load initial data:", error);
            } finally {
                setIsLoadingInit(false);
            }
        }
        if (paperId) fetchData();
    }, [paperId]);

    // 2. Fetch matched researchers whenever the active tab changes
    useEffect(() => {
        async function fetchMatches() {
            if (!activeTab) return;

            setIsLoadingMatches(true);
            setCandidates([]); // Clear old candidates while loading

            try {
                // Hitting your live vector matchmaker endpoint!
                const res = await fetch(`http://localhost:8000/api/v1/components/${activeTab}/match?limit=3`);

                if (res.ok) {
                    const data = await res.json();
                    setCandidates(data.candidates || []);
                } else {
                    console.error("Matchmaking failed");
                }
            } catch (error) {
                console.error("Failed to fetch matches:", error);
            } finally {
                setIsLoadingMatches(false);
            }
        }
        fetchMatches();
    }, [activeTab]);

    const handleInviteToggle = (candidateId: string) => {
        setInvited(prev => ({ ...prev, [candidateId]: !prev[candidateId] }));
    };

    // 3. The actual API trigger for sending invitations
    const handleSendInvitations = async () => {
        if (!activeTab) return;
        setIsSending(true);

        try {
            const selectedResearcherIds = Object.keys(invited).filter(id => invited[id]);

            for (const researcherId of selectedResearcherIds) {
                await fetch(`http://localhost:8000/api/v1/invitations/send`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        component_id: activeTab,
                        researcher_id: researcherId
                    })
                });
            }

            alert("Invitations sent successfully! Check your FastAPI terminal for the Magic Links.");

            // Mark them as sent locally using the composite key
            const newSentInvites: Record<string, boolean> = {};
            selectedResearcherIds.forEach(id => {
                newSentInvites[`${activeTab}_${id}`] = true;
            });
            setSentInvites(prev => ({ ...prev, ...newSentInvites }));

            // Clear selection after sending so the floating bar hides
            setInvited({});

        } catch (error) {
            console.error("Failed to send invites:", error);
            alert("An error occurred while sending invitations.");
        } finally {
            setIsSending(false);
        }
    };

    const activeComponent = components.find(c => c.id === activeTab);
    const totalInvited = Object.values(invited).filter(Boolean).length;

    const getScoreColor = (score: number) => {
        if (score >= 85) return 'text-emerald-700';
        if (score >= 70) return 'text-gray-700';
        return 'text-amber-700';
    };

    if (isLoadingInit) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#f1f3f5]">
                <Loader2 className="animate-spin text-gray-500 mb-4" size={36} />
                <h2 className="text-lg font-bold text-gray-900 tracking-tight">Loading Pipeline Data...</h2>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-[#f1f3f5] font-sans">

            {/* TOP NAVBAR */}
            <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0 z-10">
                <div className="flex items-center gap-4">
                    <Link href="/">
                        <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600 active:scale-95">
                            <ArrowLeft size={18} />
                        </button>
                    </Link>
                    <div className="h-5 w-px bg-gray-200"></div>
                    <div>
                        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-[0.12em]">Step 2 of 3</p>
                        <h1 className="text-sm font-semibold text-gray-900 tracking-tight">Reviewer Matchmaking</h1>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Link href={`/paper/${paperId}/track`}>
                        <button className="text-sm font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 px-4 py-1.5 rounded-lg transition-colors border border-gray-200 flex items-center gap-1.5 active:scale-[0.97]">
                            Go to Pipeline Tracker <ChevronRight size={15} />
                        </button>
                    </Link>
                </div>
            </header>

            <main className="flex-1 flex flex-col max-w-7xl mx-auto w-full p-8 pb-32">

                {/* COMPONENT TABS */}
                <div className="flex gap-1 border-b border-gray-200 mb-8 overflow-x-auto pb-px">
                    {components.map((comp) => (
                        <button
                            key={comp.id}
                            onClick={() => {
                                setActiveTab(comp.id);
                                setInvited({});
                            }}
                            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-200 whitespace-nowrap ${activeTab === comp.id
                                ? 'border-gray-800 text-gray-700'
                                : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
                                }`}
                        >
                            {comp.name}
                        </button>
                    ))}
                </div>

                {/* ACTIVE COMPONENT SUMMARY */}
                {activeComponent && (
                    <div className="mb-8 card p-5 animate-slide-up-fade">
                        <h2 className="text-base font-bold text-gray-900 mb-1 tracking-tight">{activeComponent.name}</h2>
                        <p className="text-sm text-gray-500 mb-3 leading-relaxed">{activeComponent.description}</p>
                        <div className="flex gap-1.5 flex-wrap items-center">
                            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mr-1.5">Required Expertise:</span>
                            {(activeComponent.expertise_tags || []).map((tag: string, idx: number) => (
                                <span key={idx} className="px-2 py-0.5 bg-gray-50 text-gray-700 text-xs font-medium rounded border border-gray-200">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* MATCHMAKING LOADER */}
                {isLoadingMatches ? (
                    <div className="flex flex-col items-center justify-center py-20 card border-dashed">
                        <Search className="animate-pulse text-gray-400 mb-4" size={28} />
                        <p className="font-medium text-gray-700 text-sm">Querying Vector Database...</p>
                        <p className="text-xs text-gray-400 mt-1">Finding qualified researchers based on semantic embeddings.</p>
                    </div>
                ) : candidates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 card border-dashed">
                        <AlertTriangle className="text-amber-400 mb-4" size={28} />
                        <p className="font-medium text-gray-700 text-sm">No matching researchers found in the database.</p>
                        <p className="text-xs text-gray-400 mt-1">Ensure your vector embeddings are populated.</p>
                    </div>
                ) : (
                    /* CANDIDATE CARDS */
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {candidates.map((candidate, index) => {

                            const profileUrl = candidate.openalex_link
                                ? candidate.openalex_link.replace('openalex.org', 'www.semanticscholar.org/author')
                                : '#';

                            const isAlreadySent = sentInvites[`${activeTab}_${candidate.researcher_id}`];
                            const isCurrentlySelected = invited[candidate.researcher_id];

                            return (
                                <div
                                    key={candidate.researcher_id}
                                    className="card card-hover flex flex-col overflow-hidden animate-slide-up-fade"
                                    style={{ animationDelay: `${index * 100}ms` }}
                                >
                                    {/* Card Header */}
                                    <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                                        <div className="flex justify-between items-start mb-1">
                                            <h3 className="font-bold text-gray-900 leading-tight">{candidate.name}</h3>
                                            <span className={`text-2xl font-black ${getScoreColor(candidate.match_reasoning.final_score)}`}>
                                                {candidate.match_reasoning.final_score}%
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-400 flex items-center gap-1.5">
                                            <BookOpen size={13} />
                                            {candidate.institution}
                                        </p>
                                    </div>

                                    <div className="p-5 flex-1 flex flex-col gap-4">
                                        {/* Score Breakdown */}
                                        <div className="space-y-2.5">
                                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Match Breakdown</p>
                                            <div>
                                                <div className="flex items-center justify-between text-sm mb-1">
                                                    <span className="text-gray-500">Semantic Relevance</span>
                                                    <span className="font-semibold text-gray-700">{candidate.match_reasoning.vector_similarity}%</span>
                                                </div>
                                                <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                    <div className="bg-gray-800 h-1.5 rounded-full progress-bar transition-all duration-700" style={{ width: `${candidate.match_reasoning.vector_similarity}%` }} />
                                                </div>
                                            </div>
                                            <div>
                                                <div className="flex items-center justify-between text-sm mb-1">
                                                    <span className="text-gray-500">Publication Activity</span>
                                                    <span className="font-semibold text-gray-700">{candidate.match_reasoning.activity_score}/100</span>
                                                </div>
                                                <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                    <div className="bg-emerald-500 h-1.5 rounded-full progress-bar transition-all duration-700" style={{ width: `${candidate.match_reasoning.activity_score}%` }} />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Badges */}
                                        <div className="flex flex-col gap-1.5">
                                            <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-emerald-200">
                                                <ShieldCheck size={14} /> No Conflicts Detected
                                            </span>
                                            <span className="flex items-center gap-1.5 text-gray-500 bg-gray-50 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200">
                                                <Activity size={14} className="text-gray-400" /> Status: {candidate.availability_estimate}
                                            </span>
                                        </div>

                                        {/* Expertise Preview */}
                                        <div className="mt-auto pt-2">
                                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Expertise Preview</p>
                                            <p className="text-xs text-gray-500 line-clamp-3 mb-2 leading-relaxed">{candidate.expertise_preview}</p>
                                            <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-600 hover:text-gray-800 flex items-center gap-1 font-medium transition-colors">
                                                <ExternalLink size={11} /> View Full Profile
                                            </a>
                                        </div>
                                    </div>

                                    {/* Action Footer */}
                                    <div className="p-4 border-t border-gray-100 bg-gray-50/30">
                                        <button
                                            onClick={() => !isAlreadySent && handleInviteToggle(candidate.researcher_id)}
                                            disabled={isAlreadySent}
                                            className={`w-full py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.97] ${isAlreadySent
                                                    ? 'bg-gray-50 text-gray-400 border border-gray-200 cursor-not-allowed'
                                                    : isCurrentlySelected
                                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                        : 'bg-gray-900 text-white hover:bg-gray-800 shadow-sm'
                                                }`}
                                        >
                                            {isAlreadySent ? (
                                                <><CheckCircle2 size={14} /> Invite Sent</>
                                            ) : isCurrentlySelected ? (
                                                <><CheckCircle2 size={14} /> Selected for Invite</>
                                            ) : (
                                                <><UserPlus size={14} /> Select Reviewer</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

            </main>

            {/* FLOATING ACTION BAR */}
            <div className={`fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] transform transition-transform duration-300 z-30 ${totalInvited > 0 ? 'translate-y-0' : 'translate-y-full'}`}>
                <div className="max-w-7xl mx-auto flex items-center justify-between px-4">
                    <div>
                        <p className="font-bold text-gray-900">{totalInvited} Reviewer(s) Selected</p>
                        <p className="text-sm text-gray-400">Ready to generate secure access tokens.</p>
                    </div>
                    <button
                        onClick={handleSendInvitations}
                        disabled={isSending}
                        className={`px-8 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-all duration-200 active:scale-[0.97] text-sm ${isSending ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-900 hover:bg-gray-800 text-white shadow-sm'}`}
                    >
                        {isSending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                        {isSending ? "Sending..." : "Send Invitations"}
                    </button>
                </div>
            </div>

        </div>
    );
}