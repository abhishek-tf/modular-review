'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  BookOpen, Layers, Users, FileText, CheckCircle,
  AlertCircle, ChevronRight, Clock, Loader2, Upload
} from 'lucide-react';
import Link from 'next/link';

export default function EditorDashboard() {
  const [papers, setPapers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // NEW: State to track which sidebar tab is active
  const [activeFilter, setActiveFilter] = useState<string>('all');

  // Reference to the hidden file input
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extracted fetch function so we can re-call it after uploading
  const fetchPapers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/v1/papers', {
        cache: 'no-store',
        headers: {
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache'
        }
      });
      const data = await res.json();

      if (data.success) {
        setPapers(data.papers);
      }
    } catch (error) {
      console.error("Failed to fetch papers:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPapers();
  }, []);

  // Handle the actual file upload to FastAPI
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('Please upload a valid PDF file.');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('http://localhost:8000/api/v1/papers/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // Success! Re-fetch the queue to show the new paper
        await fetchPapers();
        setActiveFilter('Awaiting Decomposition'); // Auto-switch tab to show the new upload
      } else {
        alert(`Upload failed: ${data.detail || 'An error occurred'}`);
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("Network error during upload. Is your FastAPI server running?");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Filter the papers based on the selected sidebar tab
  const filteredPapers = papers.filter((paper) => {
    if (activeFilter === 'all') return true;
    return paper.status === activeFilter;
  });

  // Helper to format raw filenames into beautiful academic titles
  const formatTitle = (title: string) => {
    if (!title || title === "Manuscript Under Review") return "Manuscript Under Review";
    return title
      .replace(/\.pdf$/i, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const sidebarItems = [
    { key: 'all', label: 'Active Papers', icon: BookOpen },
    { key: 'Awaiting Decomposition', label: 'Awaiting Decomposition', icon: Layers },
    { key: 'Reviewer Pending', label: 'Reviewer Pending', icon: Users },
    { key: 'In Review', label: 'In Review', icon: FileText },
    { key: 'Review Complete', label: 'Complete', icon: CheckCircle },
  ];

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'Awaiting Decomposition': return 'bg-gray-800';
      case 'Reviewer Pending': return 'bg-gray-700';
      case 'In Review': return 'bg-amber-500';
      case 'Review Complete': return 'bg-emerald-500';
      default: return 'bg-gray-400';
    }
  };

  return (
    <div className="min-h-screen bg-[#f1f3f5] flex font-sans">

      {/* Hidden File Input */}
      <input
        type="file"
        accept="application/pdf"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileUpload}
      />

      {/* LEFT SIDEBAR */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="p-6 border-b border-gray-100">
          <h1 className="text-lg font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center">
              <Layers className="text-white" size={15} />
            </div>
            ModularReview
          </h1>
          <p className="text-[11px] text-gray-400 mt-1 uppercase tracking-[0.15em] font-medium">Editor Portal</p>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-0.5">
          {sidebarItems.map(item => (
            <button
              key={item.key}
              onClick={() => setActiveFilter(item.key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium transition-all duration-200 text-[13px] ${activeFilter === item.key
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                }`}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100 mx-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center text-xs font-bold text-white">
              SJ
            </div>
            <div>
              <p className="text-gray-900 font-semibold text-sm">Dr. Sarah Jenkins</p>
              <p className="text-[11px] text-gray-400">Chief Editor</p>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="mb-8 flex justify-between items-end">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
              {activeFilter === 'all' ? 'Active Papers' : activeFilter}
            </h2>
            <p className="text-gray-500 mt-1 text-sm">Manage your manuscript pipeline.</p>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className={`px-4 py-2.5 text-sm font-semibold rounded-lg flex items-center gap-2 transition-all duration-200 active:scale-[0.97] ${isUploading
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-gray-900 text-white hover:bg-gray-800 shadow-sm'
              }`}
          >
            {isUploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {isUploading ? 'Uploading & Parsing...' : 'Upload New Manuscript'}
          </button>
        </header>

        {isLoading && papers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="animate-spin text-gray-500 mb-4" size={32} />
            <p className="text-gray-500 font-medium text-sm">Loading manuscript pipeline...</p>
          </div>
        ) : filteredPapers.length === 0 ? (
          <div className="text-center py-24 card rounded-xl border-dashed">
            <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
              <FileText size={24} className="text-gray-300" />
            </div>
            <p className="text-gray-500 font-medium text-sm">No papers found in this category.</p>
            {activeFilter === 'all' && (
              <p className="text-xs text-gray-400 mt-1">Upload a manuscript to get started.</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPapers.map((paper, index) => (
              <div
                key={paper.id}
                className="card card-hover p-5 flex items-center justify-between animate-slide-up-fade group"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
                      {paper.journal}
                    </span>
                    {paper.urgency === 'high' && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        <AlertCircle size={11} /> Action Required
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-semibold text-gray-900 leading-snug group-hover:text-gray-700 transition-colors duration-200">
                    {formatTitle(paper.title)}
                  </h3>

                  <div className="flex items-center gap-4 mt-2.5 text-sm text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <Clock size={13} /> Submitted: {paper.submissionDate}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${getStatusDot(paper.status)}`} />
                      <span className="text-gray-500">{paper.status}</span>
                    </span>
                  </div>
                </div>

                <div>
                  {paper.status === "Awaiting Decomposition" && (
                    <Link href={`/paper/${paper.id}/decompose`}>
                      <button className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 transition-all duration-200 text-sm active:scale-[0.97] shadow-sm">
                        Decompose Paper <ChevronRight size={15} />
                      </button>
                    </Link>
                  )}
                  {paper.status === "Reviewer Pending" && (
                    <Link href={`/paper/${paper.id}/match`}>
                      <button className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 transition-all duration-200 text-sm active:scale-[0.97] shadow-sm">
                        Assign Reviewers <ChevronRight size={15} />
                      </button>
                    </Link>
                  )}
                  {(paper.status === "In Review" || paper.status === "Review Complete") && (
                    <Link href={`/paper/${paper.id}/track`}>
                      <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 text-sm active:scale-[0.97]">
                        View Progress <ChevronRight size={15} />
                      </button>
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}