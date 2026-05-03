'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
    BookOpen, CheckCircle2, AlertTriangle, ShieldCheck,
    Clock, Save, Send, Loader2, Award, Lock
} from 'lucide-react';

function ReviewPortalContent() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    // App State
    const [isValidating, setIsValidating] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [certificate, setCertificate] = useState<any>(null);

    // Data State
    const [component, setComponent] = useState<any>(null);
    const [reviewId, setReviewId] = useState<string>('');

    // Form State
    const [answers, setAnswers] = useState({
        methodology: '',
        validity: '',
        suggestions: ''
    });

    // Tracking & Autosave State
    const [timeSpent, setTimeSpent] = useState(0);
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    // Refs for intervals to access latest state without closure stale data
    const answersRef = useRef(answers);
    const timeSpentRef = useRef(timeSpent);

    useEffect(() => {
        answersRef.current = answers;
        timeSpentRef.current = timeSpent;
    }, [answers, timeSpent]);

    // 1. Validate the JWT Token on Load
    useEffect(() => {
        async function validateToken() {
            if (!token) {
                setError("No invitation token found in the URL.");
                setIsValidating(false);
                return;
            }

            try {
                const res = await fetch(`http://localhost:8000/api/v1/invitations/validate?token=${token}`);
                const data = await res.json();

                if (res.ok && data.valid) {
                    setComponent(data.component);

                    if (data.autosave_data) {
                        setReviewId(data.autosave_data.id);
                        if (data.autosave_data.answers) setAnswers(data.autosave_data.answers);
                        if (data.autosave_data.time_spent_seconds) setTimeSpent(data.autosave_data.time_spent_seconds);
                        if (data.autosave_data.is_submitted) {
                            setIsSubmitted(true);
                            fetchCertificate(data.autosave_data.id);
                        }
                    }
                } else {
                    setError(data.detail || "Invalid or expired invitation link.");
                }
            } catch (err) {
                setError("Network error. Could not reach the verification server.");
            } finally {
                setIsValidating(false);
            }
        }

        validateToken();
    }, [token]);

    // 2. The Time Tracker
    useEffect(() => {
        if (isValidating || error || isSubmitted) return;

        const timer = setInterval(() => {
            setTimeSpent(prev => prev + 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [isValidating, error, isSubmitted]);

    // 3. The Autosave Engine
    const triggerAutosave = async () => {
        if (!token || isSubmitted) return;
        setIsSaving(true);
        try {
            await fetch(`http://localhost:8000/api/v1/review/autosave`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: token,
                    answers: answersRef.current,
                    time_spent_seconds: timeSpentRef.current
                })
            });
            setLastSaved(new Date());
        } catch (err) {
            console.error("Autosave failed", err);
        } finally {
            setIsSaving(false);
        }
    };

    // 4. Final Submission Pipeline
    const handleSubmit = async () => {
        if (!window.confirm("Are you sure you want to submit your final review?")) return;

        try {
            setIsSaving(true);
            const res = await fetch(`http://localhost:8000/api/v1/review/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: token,
                    answers: answers,
                    time_spent_seconds: timeSpent
                })
            });

            if (res.ok) {
                setIsSubmitted(true);
                // Step 13: Generate the official contribution certificate!
                await fetchCertificate(reviewId);
            } else {
                alert("Submission failed. Please try again.");
            }
        } catch (err) {
            alert("Network error during submission.");
        } finally {
            setIsSaving(false);
        }
    };

    const fetchCertificate = async (id: string) => {
        try {
            const res = await fetch(`http://localhost:8000/api/v1/review/${id}/contribution?sync_orcid=true`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.success) setCertificate(data);
        } catch (err) {
            console.error("Failed to fetch certificate", err);
        }
    };

    // Helper to format MM:SS
    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    // Render Loading/Error States
    if (isValidating) {
        return (
            <div className="h-screen flex flex-col items-center justify-center bg-[#f1f3f5]">
                <Loader2 className="animate-spin text-gray-500 mb-4" size={40} />
                <h2 className="text-lg font-bold text-gray-900 tracking-tight">Verifying Secure Access Token...</h2>
                <p className="text-sm text-gray-400 mt-1">Authenticating your invitation credentials.</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-screen flex items-center justify-center bg-[#f1f3f5]">
                <div className="card p-8 max-w-md text-center shadow-sm">
                    <div className="w-14 h-14 bg-rose-50 rounded-xl flex items-center justify-center mx-auto mb-4 border border-rose-100">
                        <AlertTriangle className="text-rose-500" size={28} />
                    </div>
                    <h2 className="text-lg font-bold text-gray-900 mb-2 tracking-tight">Access Denied</h2>
                    <p className="text-gray-500 text-sm leading-relaxed">{error}</p>
                </div>
            </div>
        );
    }

    // Render the Grand Finale Certificate View
    if (isSubmitted && certificate) {
        return (
            <div className="min-h-screen bg-[#f1f3f5] flex items-center justify-center p-6 font-sans">
                <div className="max-w-2xl w-full card overflow-hidden shadow-lg animate-tilt-enter">
                    {/* Top accent bar */}
                    <div className="h-1.5 w-full bg-gray-900" />

                    <div className="p-10 text-center">
                        <div className="w-16 h-16 bg-emerald-50 rounded-xl flex items-center justify-center mx-auto mb-5 border border-emerald-200">
                            <Award className="text-emerald-600" size={32} />
                        </div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight mb-1.5">Review Complete</h1>
                        <p className="text-gray-500 text-base mb-8">Thank you for advancing the frontiers of science.</p>

                        <div className="bg-gray-50 rounded-xl p-6 text-left border border-gray-200 space-y-4">
                            <h3 className="font-bold text-gray-500 uppercase tracking-[0.15em] text-[11px] flex items-center gap-2 mb-3">
                                <ShieldCheck size={15} className="text-gray-500" /> Verified Contribution Record
                            </h3>

                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-gray-400 mb-1 text-xs uppercase tracking-wider">Time Credited</p>
                                    <p className="font-bold text-gray-900 text-lg">{certificate.time_credited_minutes} <span className="text-sm font-medium text-gray-400">minutes</span></p>
                                </div>
                                <div>
                                    <p className="text-gray-400 mb-1 text-xs uppercase tracking-wider">ORCID Status</p>
                                    <p className="font-bold text-emerald-600 flex items-center gap-1 text-lg">
                                        <CheckCircle2 size={16} /> {certificate.orcid_status}
                                    </p>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-gray-200 mt-4">
                                <p className="text-gray-400 text-[11px] mb-2 uppercase tracking-[0.12em] font-semibold">Cryptographic Verification Hash (HMAC-SHA256)</p>
                                <code className="text-xs text-gray-700 bg-gray-50 px-3 py-2.5 rounded-lg block break-all font-mono border border-gray-100">
                                    {certificate.verification_hash}
                                </code>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Render the Active Review Split-Screen Portal
    return (
        <div className="h-screen flex flex-col bg-[#f1f3f5] font-sans overflow-hidden">

            {/* SECURE HEADER */}
            <header className="h-14 bg-gray-900 text-white flex items-center justify-between px-6 shrink-0 z-10">
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center">
                        <Lock className="text-white" size={13} />
                    </div>
                    <h1 className="text-sm font-semibold tracking-tight">T&F Secure Review Portal</h1>
                </div>

                <div className="flex items-center gap-6 text-sm font-medium">
                    <div className="flex items-center gap-2 text-gray-300">
                        <Clock size={14} className="text-gray-500" /> Session: <span className="text-white font-mono">{formatTime(timeSpent)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                        {isSaving ? (
                            <span className="text-amber-400 flex items-center gap-1.5 text-xs"><Loader2 size={12} className="animate-spin" /> Saving...</span>
                        ) : lastSaved ? (
                            <span className="text-emerald-400 flex items-center gap-1.5 text-xs"><CheckCircle2 size={12} /> Saved at {lastSaved.toLocaleTimeString()}</span>
                        ) : (
                            <span className="text-gray-500 flex items-center gap-1.5 text-xs"><Save size={12} /> Draft locally modified</span>
                        )}
                    </div>
                </div>
            </header>

            <main className="flex-1 flex overflow-hidden">

                {/* LEFT PANEL: Component Focus */}
                <div className="w-1/3 lg:w-2/5 bg-gray-50 border-r border-gray-200 p-8 overflow-y-auto">
                    <div className="card p-6 mb-6">
                        <div className="flex items-center gap-2 text-gray-600 text-[11px] font-bold uppercase tracking-[0.15em] mb-4">
                            <BookOpen size={14} /> Target Component
                        </div>
                        <h2 className="text-xl font-black text-gray-900 leading-tight mb-3 tracking-tight">
                            {component?.name}
                        </h2>
                        <p className="text-gray-500 leading-relaxed text-sm">
                            {component?.description}
                        </p>

                        <div className="mt-5 pt-5 border-t border-gray-100">
                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">Relevant Tags</p>
                            <div className="flex flex-wrap gap-1.5">
                                {(component?.expertise_tags || []).map((tag: string) => (
                                    <span key={tag} className="px-2 py-1 bg-gray-50 text-gray-700 text-xs font-medium rounded border border-gray-200">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT PANEL: The Editor/Form */}
                <div className="flex-1 bg-white flex flex-col relative overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-8 pb-28 space-y-7">

                        <div className="space-y-2.5">
                            <label className="block text-sm font-bold text-gray-900 tracking-tight">1. Methodology Assessment</label>
                            <p className="text-xs text-gray-400 mb-1.5">Does this component accurately describe the methods used? Are there gaps?</p>
                            <div className="focus-ring rounded-lg transition-all duration-200">
                                <textarea
                                    value={answers.methodology}
                                    onChange={(e) => setAnswers({ ...answers, methodology: e.target.value })}
                                    onBlur={triggerAutosave}
                                    placeholder="Type your methodology feedback here..."
                                    className="w-full h-36 p-4 text-gray-900 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-300/40 focus:border-gray-400 outline-none resize-none transition-all placeholder:text-gray-300 text-sm"
                                />
                            </div>
                        </div>

                        <div className="space-y-2.5">
                            <label className="block text-sm font-bold text-gray-900 tracking-tight">2. Technical Validity</label>
                            <p className="text-xs text-gray-400 mb-1.5">Are there any fundamental flaws or incorrect assumptions in this section?</p>
                            <div className="focus-ring rounded-lg transition-all duration-200">
                                <textarea
                                    value={answers.validity}
                                    onChange={(e) => setAnswers({ ...answers, validity: e.target.value })}
                                    onBlur={triggerAutosave}
                                    placeholder="Assess the technical validity..."
                                    className="w-full h-36 p-4 text-gray-900 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-300/40 focus:border-gray-400 outline-none resize-none transition-all placeholder:text-gray-300 text-sm"
                                />
                            </div>
                        </div>

                        <div className="space-y-2.5">
                            <label className="block text-sm font-bold text-gray-900 tracking-tight">3. Constructive Suggestions</label>
                            <p className="text-xs text-gray-400 mb-1.5">What specific changes would improve this component?</p>
                            <div className="focus-ring rounded-lg transition-all duration-200">
                                <textarea
                                    value={answers.suggestions}
                                    onChange={(e) => setAnswers({ ...answers, suggestions: e.target.value })}
                                    onBlur={triggerAutosave}
                                    placeholder="Suggest improvements for the authors..."
                                    className="w-full h-36 p-4 text-gray-900 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-300/40 focus:border-gray-400 outline-none resize-none transition-all placeholder:text-gray-300 text-sm"
                                />
                            </div>
                        </div>

                    </div>

                    {/* ACTION FOOTER */}
                    <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 px-8 flex items-center justify-between shadow-[0_-2px_10px_rgba(0,0,0,0.03)] z-10">
                        <button
                            onClick={triggerAutosave}
                            className="px-5 py-2 text-gray-500 font-medium hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-2 active:scale-[0.97] text-sm"
                        >
                            <Save size={16} /> Save Draft
                        </button>

                        <button
                            onClick={handleSubmit}
                            disabled={isSaving}
                            className="bg-gray-900 hover:bg-gray-800 text-white px-7 py-2.5 rounded-lg font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 active:scale-[0.97] text-sm"
                        >
                            {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                            Submit Final Review
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}

// Wrap in Suspense for Next.js App Router compatibility when using useSearchParams
export default function ReviewPortal() {
    return (
        <Suspense fallback={
            <div className="h-screen flex items-center justify-center bg-[#f1f3f5]">
                <Loader2 className="animate-spin text-gray-500" size={28} />
            </div>
        }>
            <ReviewPortalContent />
        </Suspense>
    );
}