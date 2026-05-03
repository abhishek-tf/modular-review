'use client';

import React, { useState, useEffect } from 'react';
import {
    ArrowLeft, Clock, CheckCircle2, AlertCircle,
    Mail, Loader2, Sparkles, FileText, UserPlus,
    ThumbsUp, AlertTriangle, Scale, MessageSquare
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

export default function EditorTrackingView() {
    const params = useParams();
    const router = useRouter();
    const paperId = params.id as string;

    const [paper, setPaper] = useState<any>(null);
    const [components, setComponents] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [readyForReport, setReadyForReport] = useState(false);

    // Fetch real tracking data
    const fetchTrackingData = async () => {
        try {
            const res = await fetch(`http://localhost:8000/api/v1/papers/${paperId}/track`, { cache: 'no-store' });
            const data = await res.json();

            if (data.success) {
                setPaper(data.paper);
                setComponents(data.components);
                setReadyForReport(data.ready_for_report);
            }
        } catch (error) {
            console.error("Failed to load tracking data:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (paperId) fetchTrackingData();

        // Poll every 5 seconds to live-update when a reviewer submits!
        const interval = setInterval(() => {
            if (paper?.status !== 'review_complete') fetchTrackingData();
        }, 5000);
        return () => clearInterval(interval);
    }, [paperId, paper?.status]);

    // Trigger the AI Report Generation
    const handleGenerateReport = async () => {
        setIsGenerating(true);
        try {
            const res = await fetch(`http://localhost:8000/api/v1/papers/${paperId}/report/generate`, {
                method: 'POST'
            });
            if (res.ok) {
                await fetchTrackingData();
            } else {
                alert("Failed to generate report. Make sure your LLM key is configured.");
            }
        } catch (error) {
            console.error(error);
            alert("Network error.");
        } finally {
            setIsGenerating(false);
        }
    };

    // Helper to safely parse the LLM JSON output
    const parseReportJSON = (rawReport: any) => {
        if (!rawReport) return null;
        if (typeof rawReport === 'object') return rawReport;

        try {
            // Strip out markdown code blocks if the LLM added them
            const cleaned = rawReport.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleaned);
        } catch (e) {
            return null; // Fallback to raw text if it fails to parse
        }
    };

    const parsedReport = parseReportJSON(paper?.consolidated_report);

    // Determine badge color based on decision
    const getDecisionColor = (decision: string = "") => {
        const d = decision.toLowerCase();
        if (d.includes('accept') || d.includes('minor')) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
        if (d.includes('major')) return 'bg-amber-50 text-amber-800 border-amber-200';
        if (d.includes('reject')) return 'bg-rose-50 text-rose-800 border-rose-200';
        return 'bg-gray-50 text-gray-800 border-gray-200';
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'Completed':
                return { text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle2 };
            case 'In Progress':
                return { text: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200', icon: Clock };
            case 'Invite Sent':
                return { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: Mail };
            default:
                return { text: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200', icon: AlertCircle };
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#f1f3f5]">
                <Loader2 className="animate-spin text-gray-500 mb-4" size={36} />
                <h2 className="text-lg font-bold text-gray-900 tracking-tight">Loading Pipeline Telemetry...</h2>
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
                        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-[0.12em]">Pipeline Tracker</p>
                        <h1 className="text-sm font-semibold text-gray-900 tracking-tight">{paper?.title || "Manuscript Under Review"}</h1>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {/* Live Telemetry Indicator */}
                    {paper?.status !== 'review_complete' && (
                        <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-live-pulse" />
                            Live
                        </div>
                    )}
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${paper?.status === 'review_complete' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                        {paper?.status === 'review_complete' ? 'Review Complete' : 'In Review'}
                    </span>
                </div>
            </header>

            <main className="flex-1 max-w-5xl mx-auto w-full p-8 pb-32">

                {/* THE FINAL REPORT VIEW */}
                {paper?.status === 'review_complete' && paper?.consolidated_report && (
                    <>
                        <div className="mb-8 card overflow-hidden animate-slide-up-fade shadow-sm">
                            {/* Header */}
                            <div className="bg-gray-900 p-5 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <Sparkles className="text-gray-400" size={20} />
                                    <h2 className="text-lg font-bold text-white tracking-tight">AI Consolidated Editorial Report</h2>
                                </div>
                                {parsedReport?.recommended_decision && (
                                    <div className={`px-4 py-1.5 rounded-full font-bold text-xs border ${getDecisionColor(parsedReport.recommended_decision)}`}>
                                        {parsedReport.recommended_decision.toUpperCase()}
                                    </div>
                                )}
                            </div>

                            {/* Content */}
                            <div className="p-6 space-y-5 bg-gray-50/50">
                                {parsedReport ? (
                                    <>
                                        {parsedReport.decision_reasoning && (
                                            <div className="bg-white p-5 rounded-lg border border-gray-200 animate-slide-up-fade" style={{ animationDelay: '80ms' }}>
                                                <h3 className="flex items-center gap-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2.5">
                                                    <Scale className="text-gray-500" size={15} /> Editorial Reasoning
                                                </h3>
                                                <p className="text-gray-700 leading-relaxed text-sm">{parsedReport.decision_reasoning}</p>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {parsedReport.consensus_strengths && (
                                                <div className="bg-emerald-50/50 p-5 rounded-lg border border-emerald-100 animate-slide-up-fade" style={{ animationDelay: '150ms' }}>
                                                    <h3 className="flex items-center gap-2 text-[11px] font-bold text-emerald-800 uppercase tracking-wider mb-2.5">
                                                        <ThumbsUp className="text-emerald-500" size={15} /> Consensus Strengths
                                                    </h3>
                                                    <p className="text-gray-700 leading-relaxed text-sm">{parsedReport.consensus_strengths}</p>
                                                </div>
                                            )}
                                            {parsedReport.consensus_concerns && (
                                                <div className="bg-amber-50/50 p-5 rounded-lg border border-amber-100 animate-slide-up-fade" style={{ animationDelay: '220ms' }}>
                                                    <h3 className="flex items-center gap-2 text-[11px] font-bold text-amber-800 uppercase tracking-wider mb-2.5">
                                                        <AlertTriangle className="text-amber-500" size={15} /> Required Revisions
                                                    </h3>
                                                    <p className="text-gray-700 leading-relaxed text-sm">{parsedReport.consensus_concerns}</p>
                                                </div>
                                            )}
                                        </div>

                                        {parsedReport.conflicting_opinions && parsedReport.conflicting_opinions !== "No major conflicts" && parsedReport.conflicting_opinions !== "None" && (
                                            <div className="bg-gray-50/50 p-5 rounded-lg border border-gray-100 animate-slide-up-fade" style={{ animationDelay: '290ms' }}>
                                                <h3 className="flex items-center gap-2 text-[11px] font-bold text-gray-800 uppercase tracking-wider mb-2.5">
                                                    <MessageSquare className="text-gray-500" size={15} /> Reviewer Conflicts
                                                </h3>
                                                <p className="text-gray-700 leading-relaxed text-sm">{parsedReport.conflicting_opinions}</p>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="prose prose-slate max-w-none bg-white p-5 rounded-lg border border-gray-200">
                                        <ReactMarkdown>{paper.consolidated_report}</ReactMarkdown>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* RAW REVIEWER COMMENTS */}
                        <div className="mb-8 card overflow-hidden animate-slide-up-fade" style={{ animationDelay: '150ms' }}>
                            <div className="border-b border-gray-200 p-4 px-5 flex items-center justify-between bg-gray-50/50">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2 text-sm tracking-tight">
                                    <FileText size={16} className="text-gray-400" />
                                    Appended Reviewer Comments
                                </h3>
                                <span className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Raw Feedback</span>
                            </div>

                            <div className="divide-y divide-gray-100">
                                {components.map((comp) => {
                                    const completedInvites = comp.invites?.filter((inv: any) => inv.status === 'completed') || [];
                                    if (completedInvites.length === 0) return null;

                                    return (
                                        <div key={comp.id} className="p-5">
                                            <div className="mb-3">
                                                <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Component Review</span>
                                                <h4 className="text-base font-bold text-gray-900 tracking-tight">{comp.name}</h4>
                                            </div>

                                            {completedInvites.map((invite: any, idx: number) => {

                                                let safeAnswers: any = {};
                                                let isRawFallback = false;
                                                let rawText = "";

                                                try {
                                                    if (typeof invite.answers === 'object' && invite.answers !== null) {
                                                        safeAnswers = invite.answers;
                                                    } else if (typeof invite.answers === 'string') {
                                                        rawText = invite.answers;
                                                        let cleanedString = invite.answers.trim();

                                                        // Clean Postgres quotes
                                                        if (cleanedString.startsWith('"{') && cleanedString.endsWith('}"')) {
                                                            cleanedString = cleanedString.slice(1, -1);
                                                        }
                                                        cleanedString = cleanedString.replace(/""/g, '"');

                                                        // Prevent JSON.parse from dying on unescaped newlines
                                                        cleanedString = cleanedString.replace(/\n/g, '\\n').replace(/\r/g, '\\r');

                                                        try {
                                                            safeAnswers = JSON.parse(cleanedString);
                                                            if (typeof safeAnswers === 'string') safeAnswers = JSON.parse(safeAnswers);
                                                        } catch (e) {
                                                            isRawFallback = true;
                                                        }
                                                    }
                                                } catch (e) {
                                                    isRawFallback = true;
                                                }

                                                // If parsing yields an empty object but there's raw text, trigger fallback
                                                if (Object.keys(safeAnswers).length === 0 && rawText) {
                                                    isRawFallback = true;
                                                }

                                                return (
                                                    <div key={idx} className="bg-gray-50 rounded-lg p-4 border border-gray-200 mb-3 last:mb-0 animate-slide-up-fade" style={{ animationDelay: `${idx * 60}ms` }}>
                                                        <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-gray-200">
                                                            <span className="font-semibold text-sm text-gray-700">Reviewer #{idx + 1}</span>
                                                            <span className="text-xs text-gray-400 font-mono">Time spent: {Math.round((invite.time_spent_seconds || 0) / 60)} mins</span>
                                                        </div>

                                                        <div className="space-y-3">
                                                            {isRawFallback ? (
                                                                <div>
                                                                    <h5 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Raw Feedback</h5>
                                                                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{rawText}</p>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <div>
                                                                        <h5 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Methodology</h5>
                                                                        <p className="text-sm text-gray-600 whitespace-pre-wrap">{safeAnswers.methodology || "N/A"}</p>
                                                                    </div>
                                                                    <div>
                                                                        <h5 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Technical Validity</h5>
                                                                        <p className="text-sm text-gray-600 whitespace-pre-wrap">{safeAnswers.validity || "N/A"}</p>
                                                                    </div>
                                                                    <div>
                                                                        <h5 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Constructive Suggestions</h5>
                                                                        <p className="text-sm text-gray-600 whitespace-pre-wrap">{safeAnswers.suggestions || "N/A"}</p>
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}

                {/* PROGRESS TRACKER */}
                <h2 className="text-lg font-bold text-gray-900 mb-5 tracking-tight">Component Review Status</h2>

                <div className="space-y-3 mb-8">
                    {components.map((comp, index) => {
                        const badge = getStatusBadge(comp.status);
                        const BadgeIcon = badge.icon;
                        return (
                            <div
                                key={comp.id}
                                className="card card-hover p-4 flex items-center justify-between animate-slide-up-fade"
                                style={{ animationDelay: `${index * 60}ms` }}
                            >
                                <div>
                                    <h3 className="font-semibold text-gray-900 tracking-tight">{comp.name}</h3>
                                    <div className="flex items-center gap-2 mt-1.5">
                                        <span className={`flex items-center gap-1 text-xs font-bold ${badge.text} ${badge.bg} px-2 py-0.5 rounded border ${badge.border}`}>
                                            <BadgeIcon size={12} />
                                            {comp.status === 'Pending Assignment' ? 'Needs Reviewer' : comp.status}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-5">
                                    <div className="text-right">
                                        <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-0.5">Invites</p>
                                        <p className="font-bold text-gray-800 text-center">{comp.invites?.length || 0}</p>
                                    </div>

                                    {comp.status !== 'Completed' && paper?.status !== 'review_complete' && (
                                        <Link href={`/paper/${paperId}/match`}>
                                            <button className="flex items-center gap-1.5 text-sm font-medium bg-gray-50 hover:bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 transition-colors active:scale-[0.97]">
                                                <UserPlus size={14} />
                                                Assign
                                            </button>
                                        </Link>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* AGGREGATION ENGINE TRIGGER */}
                {paper?.status !== 'review_complete' && (
                    <div className="card p-8 text-center flex flex-col items-center">
                        <div className="w-14 h-14 bg-gray-50 rounded-xl flex items-center justify-center mb-4 border border-gray-100">
                            <FileText size={28} className="text-gray-500" />
                        </div>
                        <h3 className="text-base font-bold text-gray-900 mb-2 tracking-tight">Editorial Synthesis</h3>
                        <p className="text-gray-500 max-w-md mb-6 text-sm leading-relaxed">
                            Once reviews are submitted, our LLM Aggregation Engine can synthesise the disparate feedback into a single, cohesive editorial decision.
                        </p>

                        <button
                            onClick={handleGenerateReport}
                            disabled={!readyForReport || isGenerating}
                            className={`px-6 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-all duration-200 active:scale-[0.97] text-sm ${!readyForReport
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : isGenerating
                                    ? 'bg-gray-100 text-gray-400 cursor-wait'
                                    : 'bg-gray-900 hover:bg-gray-800 text-white shadow-sm'
                                }`}
                        >
                            {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                            {isGenerating ? "Synthesizing Reviews..." : "Generate Consolidated Report"}
                        </button>
                        {!readyForReport && <p className="text-xs text-gray-400 mt-3">Waiting for at least one completed review...</p>}
                    </div>
                )}

            </main>
        </div>
    );
}