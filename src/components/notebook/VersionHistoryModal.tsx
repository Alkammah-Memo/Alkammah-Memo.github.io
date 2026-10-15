import React, { useState } from 'react';
import { PageVersion, InkStroke, CanvasTextItem } from '../../types';
import { Locale } from '../../lib/translations';
import { formatCairoHeaderDateTime } from '../../lib/cairoTime';
import {
  Clock,
  History,
  Check,
  RotateCcw,
  Plus,
  X,
  FileCheck2,
  Calendar,
  Layers,
} from 'lucide-react';

interface VersionHistoryModalProps {
  isOpen: boolean;
  pageTitle: string;
  versions: PageVersion[];
  currentStrokes: InkStroke[];
  currentTextNotes?: CanvasTextItem[];
  selectedVersionId: string | null;
  locale: Locale;
  onClose: () => void;
  onSelectVersion: (version: PageVersion | null) => void;
  onRestoreVersion: (version: PageVersion) => void;
  onSaveCheckpoint: (label: string) => void;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  isOpen,
  pageTitle,
  versions,
  currentStrokes,
  currentTextNotes,
  selectedVersionId,
  locale,
  onClose,
  onSelectVersion,
  onRestoreVersion,
  onSaveCheckpoint,
}) => {
  const [newCheckpointName, setNewCheckpointName] = useState('');
  const [showNameInput, setShowNameInput] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    const label = newCheckpointName.trim() || (locale === 'ar' ? 'نقطة حفظ يدوية' : 'Manual Checkpoint');
    onSaveCheckpoint(label);
    setNewCheckpointName('');
    setShowNameInput(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
        className="bg-white/95 text-[#1d1d1f] rounded-3xl shadow-2xl border border-[#d2d2d7] w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] backdrop-blur-2xl"
      >
        {/* Header */}
        <div className="p-4 px-5 border-b border-[#e5e5ea] flex items-center justify-between bg-[#f5f5f7]/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-[#0071e3] rounded-xl border border-blue-200">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#1d1d1f] tracking-tight">
                {locale === 'ar' ? 'سجل الإصدارات والتعديلات' : 'Page Versions & Edit History'}
              </h2>
              <p className="text-xs text-[#86868b] truncate max-w-xs">{pageTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#86868b] hover:text-[#1d1d1f] rounded-lg hover:bg-black/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action: Create Checkpoint */}
        <div className="p-3 px-5 bg-[#f5f5f7]/50 border-b border-[#e5e5ea] flex flex-col gap-2">
          {!showNameInput ? (
            <button
              onClick={() => setShowNameInput(true)}
              className="flex items-center justify-center gap-2 py-2 px-3 bg-[#0071e3] hover:bg-[#0062c4] text-white rounded-xl text-xs font-semibold shadow-xs transition-all active:scale-[0.99]"
            >
              <Plus className="w-4 h-4" />
              <span>{locale === 'ar' ? 'حفظ نقطة إصدار جديدة الآن' : 'Save Version Checkpoint Now'}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newCheckpointName}
                onChange={(e) => setNewCheckpointName(e.target.value)}
                placeholder={locale === 'ar' ? 'اسم نقطة الحفظ أو المراجعة...' : 'Checkpoint label or description...'}
                className="flex-1 bg-white text-[#1d1d1f] text-xs px-3 py-2 rounded-xl border border-[#d2d2d7] focus:outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') setShowNameInput(false);
                }}
              />
              <button
                onClick={handleSave}
                className="px-3.5 py-2 bg-[#0071e3] hover:bg-[#0062c4] text-white font-bold rounded-xl text-xs shadow-xs"
              >
                {locale === 'ar' ? 'حفظ' : 'Save'}
              </button>
              <button
                onClick={() => setShowNameInput(false)}
                className="px-2 py-2 text-[#86868b] hover:text-[#1d1d1f] text-xs"
              >
                {locale === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          )}
        </div>

        {/* Version List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {/* Current Working Draft */}
          <div
            onClick={() => onSelectVersion(null)}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
              selectedVersionId === null
                ? 'bg-blue-50/80 border-[#0071e3] shadow-xs'
                : 'bg-[#f5f5f7] border-[#e5e5ea] hover:border-[#d2d2d7]'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800 mt-0.5">
                <FileCheck2 className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#1d1d1f]">
                    {locale === 'ar' ? 'المسودة الحالية المباشرة' : 'Live Working Draft'}
                  </span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-mono px-2 py-0.5 rounded-full font-semibold">
                    {locale === 'ar' ? 'النشط حالياً' : 'Active'}
                  </span>
                </div>
                <p className="text-[11px] text-[#86868b] mt-1 flex items-center gap-1.5 font-mono">
                  <Clock className="w-3 h-3 text-[#0071e3]" />
                  <span>{formatCairoHeaderDateTime(new Date(), locale)}</span>
                </p>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-[#86868b]">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3 text-[#0071e3]" />
                    {currentStrokes.length} {locale === 'ar' ? 'خطوط حبر' : 'strokes'}
                  </span>
                  {currentTextNotes && currentTextNotes.length > 0 && (
                    <span>· {currentTextNotes.length} {locale === 'ar' ? 'ملاحظات نصية' : 'notes'}</span>
                  )}
                </div>
              </div>
            </div>
            {selectedVersionId === null && (
              <Check className="w-4 h-4 text-[#0071e3] shrink-0" />
            )}
          </div>

          {/* Historical Versions */}
          {versions.length === 0 ? (
            <div className="text-center py-8 text-[#86868b] text-xs">
              {locale === 'ar'
                ? 'لا توجد نقاط حفظ بعد. تُحفظ النقاط يدوياً، وتلقائياً قبل كل استعادة لإصدار.'
                : 'No checkpoints saved yet. Checkpoints are saved manually, and automatically before every restore.'}
            </div>
          ) : (
            versions.map((ver, idx) => {
              const isSelected = selectedVersionId === ver.id;
              return (
                <div
                  key={ver.id}
                  className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-blue-50/80 border-[#0071e3] shadow-xs'
                      : 'bg-[#f5f5f7] border-[#e5e5ea] hover:border-[#d2d2d7]'
                  }`}
                >
                  <div
                    onClick={() => onSelectVersion(ver)}
                    className="flex items-start gap-3 flex-1 cursor-pointer"
                  >
                    <div className="p-2 rounded-xl bg-white text-[#515154] border border-[#d2d2d7] mt-0.5">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#1d1d1f]">
                          {ver.label || `${locale === 'ar' ? 'إصدار' : 'Version'} #${versions.length - idx}`}
                        </span>
                        <span className="text-[10px] text-[#86868b] font-mono">
                          {ver.strokeCount} {locale === 'ar' ? 'خطوط' : 'strokes'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#0071e3] mt-1 font-mono flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{ver.cairoTimestamp || formatCairoHeaderDateTime(ver.timestamp, locale)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => onSelectVersion(isSelected ? null : ver)}
                      className={`px-2.5 py-1 rounded-xl text-xs font-medium border transition-colors ${
                        isSelected
                          ? 'bg-[#0071e3] text-white border-[#0071e3] font-bold shadow-xs'
                          : 'bg-white text-[#1d1d1f] border-[#d2d2d7] hover:bg-[#e8e8ed]'
                      }`}
                    >
                      {isSelected ? (locale === 'ar' ? 'معروض' : 'Viewing') : (locale === 'ar' ? 'معاينة' : 'Preview')}
                    </button>
                    <button
                      onClick={() => {
                        onRestoreVersion(ver);
                        onClose();
                      }}
                      className="p-1.5 text-[#86868b] hover:text-emerald-700 rounded-xl hover:bg-white border border-transparent hover:border-[#d2d2d7] transition-colors"
                      title={locale === 'ar' ? 'استعادة هذا الإصدار' : 'Restore this version'}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 px-5 border-t border-[#e5e5ea] bg-[#f5f5f7]/80 flex items-center justify-between text-xs text-[#86868b]">
          <span className="font-mono text-[11px]">
            {versions.length} {locale === 'ar' ? 'إصدارات محفوظة' : 'saved checkpoints'} · Cairo Baseline
          </span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 bg-white hover:bg-[#e8e8ed] text-[#1d1d1f] border border-[#d2d2d7] rounded-xl text-xs font-semibold shadow-xs transition-colors"
          >
            {locale === 'ar' ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
