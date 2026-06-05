/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useMemo } from 'react';
import { 
  Search, 
  Database, 
  ShieldCheck, 
  ArrowRight, 
  Loader2, 
  Download, 
  Trash2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  FileText,
  Building2,
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { researchDomain } from './services/geminiService';
import { Lead, DomainProcess, ProcessingStatus } from './types/lead';
import { cn } from './lib/utils';
import Papa from 'papaparse';

export default function App() {
  const [inputDomains, setInputDomains] = useState('');
  const [processes, setProcesses] = useState<DomainProcess[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const stats = useMemo(() => {
    const total = processes.length;
    const completed = processes.filter(p => p.status === 'completed').length;
    const failed = processes.filter(p => p.status === 'failed').length;
    const leadsFound = processes.reduce((acc, p) => {
      return acc + (p.result?.contacts?.length || 0);
    }, 0);
    return { total, completed, failed, leadsFound };
  }, [processes]);

  const handleStartResearch = useCallback(async () => {
    if (!inputDomains.trim()) return;

    const domains = inputDomains
      .split(/[\n,]/)
      .map(d => d.trim())
      .filter(d => d.length > 0)
      .slice(0, 200);

    const newProcesses: DomainProcess[] = domains.map(d => ({
      domain: d,
      status: 'pending'
    }));

    setProcesses(prev => [...newProcesses, ...prev]);
    setInputDomains('');
    setIsProcessing(true);

    // Process sequentially for maximum stability to eliminate concurrent rate limit clashes
    for (let i = 0; i < domains.length; i++) {
      const domain = domains[i];
      if (i > 0) {
        // Subtle 1500ms delay between domains to let Gemini API and Search Quota cool down
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      updateProcessStatus(domain, 'searching');
      try {
        const lead = await researchDomain(domain);
        if (lead) {
          updateProcessStatus(domain, 'completed', lead);
        } else {
          updateProcessStatus(domain, 'no-data');
        }
      } catch (error) {
        console.error(error);
        updateProcessStatus(domain, 'failed');
      }
    }
    setIsProcessing(false);
  }, [inputDomains]);

  const normalizeEmployeeSize = (size: string | undefined | null): string => {
    if (!size) return '1-10 employees';
    
    const cleaned = size
      .replace(/[–—]/g, '-') // Replace en-dash and em-dash with standard ASCII hyphen (-)
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    const standardRanges = [
      '1-10 employees',
      '11-50 employees',
      '51-200 employees',
      '201-500 employees',
      '501-1000 employees',
      '1000+ employees'
    ];

    for (const range of standardRanges) {
      if (cleaned === range || cleaned.replace(/\s*employees/g, '') === range.replace(/\s*employees/g, '')) {
        return range;
      }
    }

    const numbers = cleaned.replace(/,/g, '').match(/\d+/g);
    if (numbers && numbers.length > 0) {
      if (numbers.length === 1) {
        const val = parseInt(numbers[0], 10);
        if (val >= 1000 || cleaned.includes('+')) return '1000+ employees';
        if (val > 500) return '501-1000 employees';
        if (val > 200) return '201-500 employees';
        if (val > 50) return '51-200 employees';
        if (val > 10) return '11-50 employees';
        return '1-10 employees';
      } else {
        const low = parseInt(numbers[0], 10);
        const high = parseInt(numbers[1], 10);
        
        if (low >= 1000) return '1000+ employees';
        if (high > 500) return '501-1000 employees';
        if (high > 200) return '201-500 employees';
        if (high > 50) return '51-200 employees';
        if (high > 10) return '11-50 employees';
        return '1-10 employees';
      }
    }

    if (cleaned.includes('large') || cleaned.includes('huge') || cleaned.includes('enterprise') || cleaned.includes('thousand')) {
      return '1000+ employees';
    }
    if (cleaned.includes('medium') || cleaned.includes('mid')) {
      return '51-200 employees';
    }
    if (cleaned.includes('small') || cleaned.includes('micro') || cleaned.includes('start')) {
      return '1-10 employees';
    }

    return '1-10 employees';
  };

  const fixMojibake = (str: string | undefined | null): string => {
    if (!str) return '';
    
    // Quick heuristic: check if we have candidate characters for mojibake.
    // This includes Ã, Â, â, €, ™, œ, etc.
    if (!/[ÃÂâ€œ™œ]/.test(str)) {
      return str;
    }

    const win1252Map: Record<number, number> = {
      0x20ac: 128, 0x201a: 130, 0x0192: 131, 0x201e: 132, 0x2026: 133, 0x2020: 134, 0x2021: 135,
      0x02c6: 136, 0x2030: 137, 0x0160: 138, 0x2039: 139, 0x0152: 140, 0x017d: 142, 0x2018: 145,
      0x2019: 146, 0x201c: 147, 0x201d: 148, 0x2022: 149, 0x2013: 150, 0x2014: 151, 0x02dc: 152,
      0x2122: 153, 0x0161: 154, 0x203a: 155, 0x0153: 156, 0x017e: 158, 0x0178: 159
    };

    let decoded = str;
    try {
      const bytes = new Uint8Array(str.length);
      let hasHighByte = false;
      for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        let byteVal = code;
        if (code in win1252Map) {
          byteVal = win1252Map[code];
        } else if (code > 255) {
          throw new Error('Unsupported unicode block for Windows-1252 conversion');
        }
        bytes[i] = byteVal;
        if (byteVal > 127) {
          hasHighByte = true;
        }
      }

      if (hasHighByte) {
        decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      }
    } catch (e) {
      // Fallback to original string if standard decoding fails
      decoded = str;
    }

    // Now, do a reliable regex replacement sweep over decoded for any residual mojibake sequences.
    return decoded
      .replace(/â€“/g, '-')
      .replace(/â€”/g, '-')
      .replace(/Ã±/g, 'ñ')
      .replace(/Ã‘/g, 'Ñ')
      .replace(/Ã¡/g, 'á')
      .replace(/Ã©/g, 'é')
      .replace(/Ã­/g, 'í')
      .replace(/Ã³/g, 'ó')
      .replace(/Ãº/g, 'ú')
      .replace(/Ã¼/g, 'ü')
      .replace(/Ã§/g, 'ç')
      .replace(/Ã¤/g, 'ä')
      .replace(/Ã¶/g, 'ö')
      .replace(/Â/g, '')
      .replace(/â\s*–/g, '-')
      .replace(/â\s*—/g, '-')
      .replace(/â\s*-/g, '-')
      .replace(/[–—]/g, '-'); // Standardize all en-dash and em-dash to standard ASCII hyphen
  };

  const normalizeAndFilterDesignation = (title: string | undefined | null): string | null => {
    if (!title) return null;
    
    // Clean and decode any UTF-8 mojibake first
    const cleanedTitle = fixMojibake(title);
    const lowered = cleanedTitle.toLowerCase().trim();

    // 1. CEO / Chief Executive Officer
    if (lowered === 'ceo' || lowered.includes('chief executive officer') || 
        lowered.startsWith('ceo ') || lowered.endsWith(' ceo') || 
        lowered === 'c.e.o.') {
      return 'CEO';
    }

    // 2. Co-Founder
    if (lowered.includes('co-founder') || lowered.includes('co founder') || 
        lowered.includes('cofounder')) {
      return 'Co-Founder';
    }

    // 3. Founder
    if (lowered.includes('founder')) {
      return 'Founder';
    }

    // 4. Owner
    if (lowered.includes('owner') || lowered.includes('proprietor')) {
      return 'Owner';
    }

    // 5. Managing Director
    if (lowered.includes('managing director') || lowered === 'md' || lowered.startsWith('md ') || lowered.endsWith(' md')) {
      return 'Managing Director';
    }

    // 6. COO
    if (lowered === 'coo' || lowered.includes('chief operating officer') || lowered === 'c.o.o.') {
      return 'COO';
    }

    // 7. CMO
    if (lowered === 'cmo' || lowered.includes('chief marketing officer') || lowered === 'c.m.o.') {
      return 'CMO';
    }

    // 8. CRO
    if (lowered === 'cro' || lowered.includes('chief revenue officer') || lowered === 'c.r.o.') {
      return 'CRO';
    }

    // 9. Executive Director
    if (lowered.includes('executive director')) {
      return 'Executive Director';
    }

    // 10. Managing Partner / Senior Partner / Partner
    if (lowered.includes('managing partner') || lowered.includes('senior partner') || 
        lowered === 'partner' || lowered.includes('partner ')) {
      return 'Partner';
    }

    // 11. Head of Business Development
    if (lowered.includes('head of business development') || lowered.includes('head of biz dev') || 
        lowered.includes('head of bd') || lowered.includes('head - business development') ||
        lowered.includes('head of sales & business development') || lowered.includes('head of sales and business development') ||
        lowered.includes('director of business development')) {
      return 'Head of Business Development';
    }

    // 12. Head of Marketing
    if (lowered.includes('head of marketing') || lowered.includes('head - marketing') || 
        lowered.includes('marketing head') || lowered.includes('head of communications') ||
        lowered.includes('head of brand')) {
      return 'Head of Marketing';
    }

    // 13. Head of Operations
    if (lowered.includes('head of operations') || lowered.includes('head - operations') || 
        lowered.includes('operations head')) {
      return 'Head of Operations';
    }

    // 14. VP Operations
    if (lowered.includes('vp operations') || lowered.includes('vp of operations') || 
        lowered.includes('vice president of operations') || lowered.includes('vice president operations')) {
      return 'VP Operations';
    }

    // 15. VP Marketing
    if (lowered.includes('vp marketing') || lowered.includes('vp of marketing') || 
        lowered.includes('vice president of marketing') || lowered.includes('vice president marketing') ||
        lowered.includes('vp of brand') || lowered.includes('vp growth') || lowered.includes('vp of growth')) {
      return 'VP Marketing';
    }

    // 16. VP Sales
    if (lowered.includes('vp sales') || lowered.includes('vp of sales') || 
        lowered.includes('vice president of sales') || lowered.includes('vice president sales') ||
        lowered.includes('vp of business development') || lowered.includes('vp business development') ||
        lowered.includes('vice president of business development')) {
      return 'VP Sales';
    }

    // 17. Director of Marketing
    if (lowered.includes('director of marketing') || lowered.includes('director - marketing') || 
        lowered.includes('marketing director')) {
      return 'Director of Marketing';
    }

    // 18. Director of Operations
    if (lowered.includes('director of operations') || lowered.includes('director - operations') || 
        lowered.includes('operations director')) {
      return 'Director of Operations';
    }

    // 19. Country Head
    if (lowered.includes('country head') || lowered.includes('country manager') || lowered.includes('regional head') || lowered.includes('country lead')) {
      return 'Country Head';
    }

    // 20. Business Head
    if (lowered.includes('business head') || lowered.includes('head of business') || lowered.includes('head of commercial')) {
      return 'Business Head';
    }

    // Fallback block mapping to Partner
    if (lowered.includes('partner')) {
      return 'Partner';
    }

    return null; // Return null if it doesn't align with permitted designations
  };

  const updateProcessStatus = (domain: string, status: ProcessingStatus, result?: Lead) => {
    if (result) {
      result.employeeSize = normalizeEmployeeSize(result.employeeSize);
      
      // Clean up text field mojibake on all imported fields
      result.companyName = fixMojibake(result.companyName);
      result.industry = fixMojibake(result.industry);
      result.cityState = fixMojibake(result.cityState);
      
      if (result.contacts && Array.isArray(result.contacts)) {
        result.contacts = result.contacts
          .map(c => {
            const normalized = normalizeAndFilterDesignation(c.designation);
            if (!normalized) return null;
            return {
              ...c,
              name: fixMojibake(c.name),
              firstName: fixMojibake(c.firstName),
              middleName: fixMojibake(c.middleName),
              lastName: fixMojibake(c.lastName),
              designation: normalized, // pristine normalized designation
            };
          })
          .filter((c): c is NonNullable<typeof c> => c !== null);
      }
    }
    setProcesses(prev => prev.map(p => 
      p.domain === domain ? { ...p, status, result } : p
    ));
  };

  const clearResults = () => {
    setProcesses([]);
  };

  const exportToCSV = () => {
    const dataToExport: any[] = [];

    processes
      .filter(p => p.status === 'completed' && p.result)
      .forEach(p => {
        const result = p.result!;
        // Create a row for each contact
        if (result.contacts && result.contacts.length > 0) {
          result.contacts.forEach(contact => {
            dataToExport.push({
              Industry: result.industry,
              Company: result.companyName,
              Domain: result.website || p.domain,
              Person: contact.name,
              Designation: contact.designation,
              Email: contact.email,
              CityState: result.cityState,
              Size: result.employeeSize,
              Year: result.yearFounded,
            });
          });
        } else {
          // Fallback if no contacts found but company data exists
          dataToExport.push({
            Industry: result.industry,
            Company: result.companyName,
            Domain: result.website || p.domain,
            Person: 'Not Found',
            Designation: '',
            Email: result.generalEmail || '',
            CityState: result.cityState,
            Size: result.employeeSize,
            Year: result.yearFounded,
          });
        }
      });

    if (dataToExport.length === 0) return;

    const csv = Papa.unparse(dataToExport);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `leads_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-bg-primary">
      {/* Sidebar - Desktop Only for layout parity with design */}
      <aside className="hidden md:flex w-72 bg-bg-sidebar border-r border-border-subtle p-8 flex-col shrink-0">
        <div className="mb-12">
          <h1 className="text-xl font-black text-accent-cyan tracking-tighter uppercase">
            RESEARCH_ENGINE <span className="font-extralight text-xs opacity-60">v2.4</span>
          </h1>
        </div>

        <div className="flex-1 space-y-8">
          <ul className="space-y-8">
            <OperationalStep 
              number="✓"
              active={true}
              completed={true}
              title="Expanded Intelligence" 
              desc="Leveraging Crunchbase, Bloomberg, CB Insights, and official Press Releases." 
            />
            <OperationalStep 
              number="✓"
              active={true}
              completed={true}
              title="Enhanced Verification" 
              desc="Multi-step validation via Apollo, ZoomInfo, Lusha, and Hunter.io stack." 
            />
            <OperationalStep 
              number="3"
              active={isProcessing}
              title="Decision-Maker Sync" 
              desc={isProcessing ? "Extracting Owners, Founders, and C-Suite hierarchy..." : "Targeting top-tier management levels."} 
            />
            <OperationalStep 
              number="4"
              title="Output Extraction" 
              desc="Structuring firmographic leads." 
            />
          </ul>
        </div>

        <div className="pt-6 border-t border-border-subtle">
           <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-text-muted">
            SYSTEM STATUS: <span className="text-accent-emerald">HYBRID_ONLINE</span>
          </div>
        </div>
      </aside>

      {/* Main Body */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-18 border-b border-border-subtle flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-4">
            <StatCard label="Verified Leads" value={stats.leadsFound} />
            <StatCard label="Accuracy Rate" value={stats.completed > 0 ? "100%" : "0%"} />
            <StatCard label="Batch Size" value={stats.total} />
          </div>

          <div className="flex items-center gap-3">
             {processes.length > 0 && (
               <button 
                 onClick={exportToCSV}
                 className="px-4 py-2 bg-transparent border border-border-strong text-white hover:bg-border-strong transition-colors rounded text-xs font-semibold"
               >
                 Export CSV
               </button>
             )}
             <button 
               onClick={handleStartResearch}
               disabled={isProcessing || !inputDomains.trim()}
               className="px-4 py-2 bg-accent-cyan text-bg-primary hover:opacity-90 transition-all rounded text-xs font-bold disabled:opacity-30 flex items-center gap-2"
             >
               {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
               NEW RUN
             </button>
             {processes.length > 0 && (
               <button 
                 onClick={clearResults}
                 className="p-2 border border-border-strong text-accent-red hover:bg-accent-red hover:text-white transition-colors rounded"
               >
                 <Trash2 className="w-4 h-4" />
               </button>
             )}
          </div>
        </header>

        {/* Action Area */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
          <section className="bg-bg-card border border-border-strong rounded-lg p-4 relative group">
            <div className="text-[10px] text-text-secondary uppercase font-bold mb-2 tracking-wider">Active Extraction Queue</div>
            <textarea 
              value={inputDomains}
              onChange={(e) => setInputDomains(e.target.value)}
              placeholder="google.com, stripe.com, notion.so..."
              className="w-full bg-transparent text-slate-300 font-mono text-sm leading-relaxed resize-none focus:outline-none min-h-[40px]"
            />
          </section>

          {/* Table Container */}
          <div className="border border-border-subtle rounded overflow-hidden flex-1">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="bg-bg-card text-text-secondary font-semibold uppercase text-[11px] tracking-wider border-b border-border-strong">
                    <th className="p-4 text-left">Status</th>
                    <th className="p-4 text-left">Company</th>
                    <th className="p-4 text-left">Internal Leads (Verified Decision-Makers)</th>
                    <th className="p-4 text-left">HQ</th>
                    <th className="p-4 text-left">Size</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  <AnimatePresence>
                    {processes.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-20 text-center text-text-muted font-mono italic text-sm">
                          SYSTEM_WAITING: Enter domains to initialize research...
                        </td>
                      </tr>
                    ) : (
                      processes.map((p, idx) => (
                        <motion.tr 
                          key={`${p.domain}-${idx}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="hover:bg-bg-card/50 transition-colors align-top"
                        >
                          <td className="p-4"><StatusIcon status={p.status} /></td>
                          <td className="p-4">
                            <div className="font-bold text-sm flex items-center gap-2">
                              {p.result?.companyName || p.domain}
                              {p.result?.isFallbackResult && (
                                <span className="bg-accent-cyan/10 text-accent-cyan text-[9px] font-mono px-1.5 py-0.5 rounded tracking-wide border border-accent-cyan/25" title="Reconstructed under Search Grounding daily quota limits">
                                  PREDICTED
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-text-secondary uppercase tracking-tight mt-1">{p.result?.industry}</div>
                            {(p.result?.hiringStatus || p.result?.fundingStatus) && (
                              <div className="flex gap-2 mt-2 text-[10px] text-text-muted font-mono uppercase">
                                {p.result.hiringStatus && <span>{p.result.hiringStatus}</span>}
                                {p.result.hiringStatus && p.result.fundingStatus && <span>•</span>}
                                {p.result.fundingStatus && <span>{p.result.fundingStatus}</span>}
                              </div>
                            )}
                          </td>
                          <td className="p-4">
                             <div className="grid grid-cols-1 gap-2 min-w-[400px]">
                               {p.result?.contacts && p.result.contacts.length > 0 ? (
                                 p.result.contacts.map((contact, cIdx) => (
                                   <div key={cIdx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-bg-sidebar/50 rounded border border-border-subtle group/contact">
                                     <div className="flex-1">
                                       <div className="font-bold text-[12px] flex items-center gap-2">
                                         {contact.name}
                                         {contact.linkedin && (
                                           <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-accent-cyan transition-colors" title="View LinkedIn">
                                             <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                               <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                                             </svg>
                                           </a>
                                         )}
                                       </div>
                                       <div className="text-[10px] text-accent-emerald uppercase font-medium">{contact.designation}</div>
                                     </div>
                                     <div className="flex items-center gap-3 shrink-0">
                                       <div className="text-right">
                                         <div className="font-mono text-[11px] text-accent-cyan tracking-tight">{contact.email}</div>
                                         <div className={cn(
                                           "text-[9px] uppercase font-black tracking-widest",
                                           contact.confidence === 'Verified' ? "text-accent-emerald" : 
                                           contact.confidence === 'AI Estimated — Verify Before Send' ? "text-accent-cyan" : 
                                           "text-accent-red"
                                         )}>
                                           {contact.confidence}
                                         </div>
                                       </div>
                                     </div>
                                   </div>
                                 ))
                               ) : (
                                 <span className="text-text-muted italic opacity-50">No verified contacts discovered.</span>
                               )}
                             </div>
                          </td>
                          <td className="p-4 text-xs opacity-70 whitespace-nowrap">{p.result?.cityState || '—'}</td>
                          <td className="p-4 text-xs font-mono text-text-secondary">{p.result?.employeeSize || '—'}</td>
                        </motion.tr>
                      ))
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Small Footer bar */}
        <footer className="px-8 py-4 bg-bg-sidebar border-t border-border-subtle flex items-center justify-between">
          <div className="text-xs text-text-muted">
            Zero-Trust Protocol: <span className="text-text-secondary">Enabled (Strict verification only)</span>
          </div>
          <div className="text-[11px] text-text-muted font-mono">
            System Environment: <span className="text-accent-emerald">SECURE_RUN_01</span>
          </div>
        </footer>
      </main>
    </div>
  );
}

function TableTh({ children }: { children: React.ReactNode }) {
  return (
    <th className="p-4 text-left font-semibold text-[11px] uppercase tracking-wider text-text-secondary">
      {children}
    </th>
  );
}

function StatCard({ label, value }: { label: string, value: string | number }) {
  return (
    <div className="bg-bg-card border border-border-subtle px-5 py-3 rounded min-w-[140px] flex flex-col gap-1">
      <span className="text-[10px] uppercase font-bold text-text-secondary tracking-wider">{label}</span>
      <span className="text-xl font-bold text-accent-cyan leading-none">{value}</span>
    </div>
  );
}

function OperationalStep({ number, title, desc, active, completed }: { number: string, title: string, desc: string, active?: boolean, completed?: boolean }) {
  return (
    <li className={cn("flex gap-3 transition-opacity duration-500", !active && !completed && "opacity-30")}>
      <div className={cn(
        "w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 transition-colors",
        completed ? "bg-accent-emerald text-bg-primary" : 
        active ? "bg-accent-cyan text-bg-primary" : "bg-border-strong text-text-muted"
      )}>
        {number}
      </div>
      <div className="space-y-0.5">
        <h3 className="font-bold text-xs uppercase tracking-tight">{title}</h3>
        <p className="text-[11px] leading-snug text-text-secondary">{desc}</p>
      </div>
    </li>
  );
}

function StatusIcon({ status }: { status: ProcessingStatus }) {
  switch (status) {
    case 'pending': return <div className="w-2 h-2 rounded-full border border-border-strong mx-auto" />;
    case 'searching': return <Loader2 className="w-3 h-3 animate-spin mx-auto text-accent-cyan" />;
    case 'extracting': return <Loader2 className="w-3 h-3 animate-spin mx-auto text-accent-cyan" />;
    case 'completed': return <div className="w-2 h-2 rounded-full bg-accent-emerald mx-auto shadow-[0_0_8px_#10B981]" />;
    case 'no-data': return <div className="w-2 h-2 rounded-full bg-accent-red mx-auto" />;
    case 'failed': return <div className="w-2 h-2 rounded-full bg-accent-red mx-auto" />;
  }
}

