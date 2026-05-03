'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    ArrowLeft, BrainCircuit, Clock, Tag,
    GitMerge, SplitSquareHorizontal, Trash2, Search,
    CheckCircle2, Sparkles, Loader2, AlertTriangle
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function PaperDecompositionView() {
    const params = useParams();

    // State for real data and error handling
    const [paper, setPaper] = useState<any>(null);
    const [components, setComponents] = useState<any[]>([]);
    const [pdfUrl, setPdfUrl] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const [isScanning, setIsScanning] = useState(true);
    const [aiError, setAiError] = useState<string | null>(null);

    // Add this near your other state variables
    const hasTriggered = useRef(false);

    // Execute the data pipeline
    useEffect(() => {
        // 1. If we've already triggered the API in this session, stop!
        if (hasTriggered.current) return;

        async function executeDataPipeline() {
            // 2. Lock the ref immediately
            hasTriggered.current = true;

            try {
                // 1. Fetch current database state
                const detailRes = await fetch(`http://localhost:8000/api/v1/papers/${params.id}/details`);
                const detailData = await detailRes.json();

                if (detailData.success) {
                    setPaper(detailData.paper);
                    setPdfUrl(detailData.pdf_url);

                    let liveComponents = detailData.components;

                    // 2. The Engine Trigger: If DB is empty, run the real AI decomposition
                    if (liveComponents.length === 0) {
                        console.log("Triggering live Gemini AI decomposition...");
                        const decomposeRes = await fetch(`http://localhost:8000/api/v1/papers/${params.id}/decompose`, {
                            method: 'POST'
                        });

                        // --- Error Handling ---
                        if (!decomposeRes.ok) {
                            const errorData = await decomposeRes.json();
                            setAiError(errorData.detail || "The AI Engine failed to process this document.");
                            setIsScanning(false);
                            setIsLoading(false);
                            return;
                        }

                        const decomposeData = await decomposeRes.json();
                        liveComponents = decomposeData.components;
                    }

                    // 3. Feed the REAL database rows into your UI animation
                    if (liveComponents && liveComponents.length > 0) {
                        const timer1 = setTimeout(() => setComponents(liveComponents.slice(0, 1)), 1000);
                        const timer2 = setTimeout(() => setComponents(liveComponents.slice(0, 2)), 2000);
                        const timer3 = setTimeout(() => {
                            setComponents(liveComponents);
                            setIsScanning(false);
                        }, 3000);

                        return () => { clearTimeout(timer1); clearTimeout(timer2); clearTimeout(timer3); };
                    } else {
                        // Fallback if the AI generation resulted in 0 components
                        setIsScanning(false);
                    }
                }
            } catch (error) {
                console.error("Data pipeline failed:", error);
                setAiError("Network error. Make sure your FastAPI server is running.");
                setIsScanning(false);
            } finally {
                setIsLoading(false);
            }
        }

        if (params.id) {
            executeDataPipeline();
        }
    }, [params.id]);

    // Helper to map 1-5 complexity scores to visual tags
    const getComplexityTag = (score: number) => {
        if (score >= 4) return { label: 'High Complexity', style: 'text-rose-700 bg-rose-50 border-rose-200' };
        if (score === 3) return { label: 'Medium Complexity', style: 'text-amber-700 bg-amber-50 border-amber-200' };
        return { label: 'Low Complexity', style: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    };

    if (isLoading) {
        return (
            <div className="h-screen w-full flex flex-col items-center justify-center bg-[#f1f3f5]">
                <Loader2 className="animate-spin text-gray-500 mb-4" size={40} />
                <h2 className="text-lg font-bold text-gray-900 tracking-tight">Fetching Manuscript Data...</h2>
                <p className="text-sm text-gray-400 mt-1">Preparing your document for analysis.</p>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-[#f1f3f5] overflow-hidden font-sans">

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
                        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-[0.12em]">ModularReview</p>
                        <h1 className="text-sm font-semibold text-gray-900 truncate max-w-xl">
                            {paper?.title || "Loading Manuscript..."}
                        </h1>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-400">Dr. Sarah Jenkins</span>
                    <div className="w-7 h-7 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-bold">SJ</div>
                </div>
            </header>

            {/* ERROR BANNER */}
            {aiError && (
                <div className="bg-rose-50 border-b border-rose-200 text-rose-800 p-3 px-6 z-20 shrink-0">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={16} />
                        <p className="font-semibold text-sm">AI Engine Error</p>
                    </div>
                    <p className="text-sm mt-0.5 text-rose-600">{aiError}</p>
                </div>
            )}

            {/* SPLIT VIEW MAIN CONTENT */}
            <main className="flex-1 flex overflow-hidden">

                {/* LEFT PANEL: PDF Viewer */}
                <div className="w-1/2 bg-gray-900 border-r border-gray-200 relative">
                    {pdfUrl ? (
                        <iframe
                            src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                            className="w-full h-full border-none"
                            title="Manuscript PDF Viewer"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500">
                            PDF URL not found.
                        </div>
                    )}
                </div>

                {/* RIGHT PANEL: AI Decomposition UI */}
                <div className="w-1/2 bg-white flex flex-col relative overflow-hidden">

                    <div className="p-5 border-b border-gray-100 bg-white z-10 shrink-0">
                        <div className="flex items-center justify-between">
                            <h2 className="text-base font-bold flex items-center gap-2 text-gray-900 tracking-tight">
                                <BrainCircuit className={isScanning && !aiError ? "text-gray-500 animate-pulse" : aiError ? "text-rose-500" : "text-emerald-500"} size={20} />
                                {isScanning && !aiError ? "AI Analyzing Structure..." : aiError ? "Analysis Failed" : "Decomposition Complete"}
                            </h2>
                            {!isScanning && !aiError && (
                                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full flex items-center gap-1 border border-emerald-200">
                                    <CheckCircle2 size={13} /> Ready for Review
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-gray-400 mt-1.5">
                            Breaking manuscript into specialized evaluation components.
                        </p>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-3 pb-48">
                        {components.map((comp, index) => {
                            const complexity = getComplexityTag(comp.complexity_score || 3);

                            return (
                                <div
                                    key={comp.id || `temp-key-${index}`}
                                    className="card card-hover p-4 animate-slide-up-fade group"
                                    style={{ animationDelay: `${index * 80}ms` }}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-semibold text-gray-900 leading-tight">{comp.name}</h3>
                                        <div className="flex gap-0.5 text-gray-300">
                                            <button className="p-1.5 hover:text-gray-600 hover:bg-gray-50 rounded-md transition-colors" title="Merge"><GitMerge size={14} /></button>
                                            <button className="p-1.5 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors" title="Split"><SplitSquareHorizontal size={14} /></button>
                                            <button className="p-1.5 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors" title="Remove"><Trash2 size={14} /></button>
                                        </div>
                                    </div>

                                    <p className="text-sm text-gray-500 mb-3 leading-relaxed">{comp.description}</p>

                                    <div className="flex flex-wrap gap-1.5 mb-3">
                                        {(comp.expertise_tags || []).map((tag: string) => (
                                            <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200">
                                                <Tag size={10} /> {tag}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="flex items-center gap-3 text-sm border-t border-gray-100 pt-3">
                                        <span className="flex items-center gap-1.5 text-gray-400 font-medium text-xs">
                                            <Clock size={13} />
                                            ~{comp.estimated_time_minutes || 30} mins
                                        </span>
                                        <span className="h-3.5 w-px bg-gray-200"></span>
                                        <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${complexity.style}`}>
                                            {complexity.label}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* THE STAT & ACTION BAR */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gray-900 text-white p-5 border-t border-gray-800 transform transition-transform duration-500 ease-out z-10"
                        style={{ transform: isScanning || components.length === 0 ? 'translateY(100%)' : 'translateY(0)' }}>

                        <div className="flex items-center gap-2.5 mb-3">
                            <Sparkles className="text-gray-400" size={18} />
                            <p className="font-medium text-gray-300 text-sm">
                                <span className="text-white font-bold">{components.length} components</span> identified.
                                Estimated: <span className="text-white font-semibold">3 reviewers, avg 30 min each.</span>
                            </p>
                        </div>

                        <div className="flex items-center justify-between bg-gray-800/60 p-2.5 rounded-lg border border-gray-700/50 mb-4 text-sm">
                            <span className="text-gray-400">Traditional review equivalent:</span>
                            <span className="font-semibold text-rose-400">1 reviewer, 3 weeks</span>
                        </div>

                        <Link href={`/paper/${params.id}/match`}>
                            <button className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm active:scale-[0.98] text-sm">
                                <Search size={18} />
                                Find Best Match Reviewers
                            </button>
                        </Link>
                    </div>

                </div>
            </main>
        </div>
    );
}