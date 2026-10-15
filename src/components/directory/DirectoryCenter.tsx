import React, { useState } from 'react';
import { Person, Project, Workstream } from '../../types';
import { Locale, translations } from '../../lib/translations';
import { INITIAL_WORKSTREAMS } from '../../lib/referenceData';
import { hasDuplicateName } from '../../lib/taskLogic';
import {
  Users,
  Building2,
  FolderGit2,
  Plus,
  ShieldCheck,
  AlertCircle,
  MapPin,
  ExternalLink,
  Edit2,
  Check,
  X,
} from 'lucide-react';

interface DirectoryCenterProps {
  people: Person[];
  projects: Project[];
  locale: Locale;
  onUpdatePerson: (person: Person) => void;
  onAddPerson: (person: Partial<Person>) => void;
  onUpdateProject: (project: Project) => void;
  onAddProject: (project: Partial<Project>) => void;
  departments: string[];
  onAddDepartment: (name: string) => void;
}

export const DirectoryCenter: React.FC<DirectoryCenterProps> = ({
  people,
  projects,
  locale,
  onUpdatePerson,
  onAddPerson,
  onUpdateProject,
  onAddProject,
  departments,
  onAddDepartment,
}) => {
  const t = translations[locale];
  const ar = locale === 'ar';
  const [activeTab, setActiveTab] = useState<'people' | 'projects' | 'departments'>('people');
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState<string>('');

  const [isAddPersonModalOpen, setIsAddPersonModalOpen] = useState(false);
  const [isAddDeptModalOpen, setIsAddDeptModalOpen] = useState(false);
  const [isAddProjectModalOpen, setIsAddProjectModalOpen] = useState(false);

  const [deptError, setDeptError] = useState('');

  // New Person Form State
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonInitials, setNewPersonInitials] = useState('');
  const [newPersonRole, setNewPersonRole] = useState('');
  const [newPersonDept, setNewPersonDept] = useState('');
  const [newPersonCompany, setNewPersonCompany] = useState('');
  const [newPersonVerified, setNewPersonVerified] = useState(true);

  // New Department Form State
  const [newDeptName, setNewDeptName] = useState('');

  // Project form state (used for both adding and editing)
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [newProjName, setNewProjName] = useState('');
  const [newProjWorkstream, setNewProjWorkstream] = useState<Workstream>(INITIAL_WORKSTREAMS[0] as Workstream);
  const [newProjStage, setNewProjStage] = useState<Project['stage']>('Pipeline');
  const [newProjCity, setNewProjCity] = useState('');
  const [newProjCountry, setNewProjCountry] = useState('');
  const [newProjNotes, setNewProjNotes] = useState('');
  const [newProjLead, setNewProjLead] = useState('');
  const [newProjCounterparty, setNewProjCounterparty] = useState('');

  const openAddPerson = () => {
    setNewPersonName('');
    setNewPersonInitials('');
    setNewPersonRole('');
    setNewPersonDept(departments[0] || '');
    setNewPersonCompany('');
    setNewPersonVerified(true);
    setIsAddPersonModalOpen(true);
  };

  const openAddDept = () => {
    setNewDeptName('');
    setDeptError('');
    setIsAddDeptModalOpen(true);
  };

  const openProjectForm = (proj: Project | null) => {
    setEditingProject(proj);
    setNewProjName(proj?.name || '');
    setNewProjWorkstream((proj?.workstream as Workstream) || (INITIAL_WORKSTREAMS[0] as Workstream));
    setNewProjStage(proj?.stage || 'Pipeline');
    setNewProjCity(proj?.city || '');
    setNewProjCountry(proj?.country || '');
    setNewProjNotes(proj?.notes || '');
    setNewProjLead(proj?.lead || '');
    setNewProjCounterparty(proj?.counterparties || '');
    setIsAddProjectModalOpen(true);
  };

  const STAGE_AR: Record<string, string> = {
    Pipeline: 'قيد الدراسة',
    'Due Diligence': 'العناية الواجبة',
    'Concession Negotiation': 'التفاوض على الامتياز',
    'EPC / Execution': 'التنفيذ',
    Operational: 'قيد التشغيل',
    'On Hold': 'معلق',
  };
  const stageLabel = (st: string) => (ar ? STAGE_AR[st] || st : st);

  const handleStartEditPerson = (p: Person) => {
    setEditingPersonId(p.id);
    setEditedName(p.name);
  };

  const handleSavePersonName = (p: Person) => {
    const name = editedName.trim() || p.name;
    // Resolving an alias to a real name verifies it; saving an unchanged name does not
    if (name !== p.name) {
      onUpdatePerson({ ...p, name, isAliasVerified: true, updatedAt: new Date().toISOString() });
    }
    setEditingPersonId(null);
  };

  const handleCreatePerson = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPersonName.trim()) return;

    const initials =
      newPersonInitials.trim().toUpperCase() ||
      newPersonName
        .trim()
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .slice(0, 3)
        .toUpperCase();

    onAddPerson({
      name: newPersonName.trim(),
      initials,
      role: newPersonRole.trim(),
      department: newPersonDept,
      company: newPersonCompany.trim(),
      isActive: true,
      createdAt: new Date().toISOString(),
      isAliasVerified: newPersonVerified,
      updatedAt: new Date().toISOString(),
    });

    setIsAddPersonModalOpen(false);
  };

  const handleCreateDepartment = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newDeptName.trim();
    if (!trimmed) return;
    if (hasDuplicateName(departments, trimmed)) {
      setDeptError(ar ? 'هذه الإدارة موجودة بالفعل.' : 'This department already exists.');
      return;
    }
    onAddDepartment(trimmed);
    setNewDeptName('');
    setDeptError('');
    setIsAddDeptModalOpen(false);
  };

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim()) return;

    const fields = {
      name: newProjName.trim(),
      workstream: newProjWorkstream,
      stage: newProjStage,
      city: newProjCity.trim(),
      country: newProjCountry.trim(),
      notes: newProjNotes.trim(),
      lead: newProjLead.trim(),
      counterparties: newProjCounterparty.trim(),
      updatedAt: new Date().toISOString(),
    };
    if (editingProject) {
      onUpdateProject({ ...editingProject, ...fields });
    } else {
      onAddProject({ ...fields, sponsor: '', createdAt: new Date().toISOString() });
    }
    setEditingProject(null);
    setIsAddProjectModalOpen(false);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Top Header */}
      <div className="bg-white/90 backdrop-blur-2xl p-6 rounded-3xl border border-[#d2d2d7] shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
            {locale === 'en' ? 'Enterprise Directory & Stakeholders' : 'دليل المؤسسة وأصحاب المصلحة'}
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            {locale === 'en'
              ? 'Manage executive team, handwritten owner aliases, strategic projects, and corporate departments.'
              : 'إدارة المسؤولين، الرموز المكتوبة غير الموثقة، المشاريع الاستراتيجية، والإدارات.'}
          </p>
        </div>

        {/* Tab switchers + Action Button */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-[#f5f5f7] p-1 rounded-2xl border border-[#d2d2d7] text-xs font-semibold">
            <button
              onClick={() => setActiveTab('people')}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                activeTab === 'people' ? 'bg-white text-[#0071e3] shadow-xs font-bold' : 'text-[#515154] hover:text-[#1d1d1f]'
              }`}
            >
              {t.navPeople} ({people.length})
            </button>
            <button
              onClick={() => setActiveTab('projects')}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                activeTab === 'projects' ? 'bg-white text-[#0071e3] shadow-xs font-bold' : 'text-[#515154] hover:text-[#1d1d1f]'
              }`}
            >
              {t.navProjects} ({projects.length})
            </button>
            <button
              onClick={() => setActiveTab('departments')}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                activeTab === 'departments' ? 'bg-white text-[#0071e3] shadow-xs font-bold' : 'text-[#515154] hover:text-[#1d1d1f]'
              }`}
            >
              {locale === 'en' ? 'Departments' : 'الإدارات'} ({departments.length})
            </button>
          </div>

          {activeTab === 'people' && (
            <button
              onClick={openAddPerson}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0071e3] hover:bg-[#0062c4] text-white rounded-xl text-xs font-bold shadow-xs transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{locale === 'ar' ? 'إضافة شخص / رمز' : 'Add Person / Alias'}</span>
            </button>
          )}

          {activeTab === 'departments' && (
            <button
              onClick={openAddDept}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0071e3] hover:bg-[#0062c4] text-white rounded-xl text-xs font-bold shadow-xs transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{locale === 'ar' ? 'إضافة إدارة جديدة' : 'Add Department'}</span>
            </button>
          )}

          {activeTab === 'projects' && (
            <button
              onClick={() => openProjectForm(null)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0071e3] hover:bg-[#0062c4] text-white rounded-xl text-xs font-bold shadow-xs transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{locale === 'ar' ? 'إضافة مشروع جديد' : 'Add Project'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab: People & Aliases */}
      {activeTab === 'people' && (
        <div className="space-y-4">
          <div className="bg-blue-50/80 border border-blue-200 p-4 rounded-2xl text-xs text-blue-900 flex items-start gap-2.5 shadow-2xs">
            <AlertCircle className="w-4 h-4 text-[#0071e3] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">
                {locale === 'en' ? 'Handwritten Alias Preservation Policy:' : 'سياسة الاحتفاظ بالرموز اليدوية:'}
              </span>
              <p className="mt-0.5 leading-relaxed text-blue-800">
                {locale === 'en'
                  ? 'Handwritten initials remain preserved as unverified aliases until you assign them to a person. Use "Add Person / Alias" to register team members and their aliases.'
                  : 'تظل الرموز المكتوبة باليد محفوظة كرموز غير موثقة حتى يتم تعيينها لشخص. استخدم "إضافة شخص / رمز" لتسجيل أعضاء الفريق ورموزهم.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {people.map((p) => (
              <div
                key={p.id}
                className="bg-white p-4 rounded-2xl border border-[#d2d2d7] shadow-xs space-y-3 hover:border-[#0071e3] transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold bg-[#f5f5f7] text-[#1d1d1f] px-2.5 py-1 rounded-xl border border-[#d2d2d7]">
                      {p.initials}
                    </span>
                    {p.isAliasVerified ? (
                      <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        {ar ? 'موثق' : 'Verified'}
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-amber-700 flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {t.unverifiedAlias}
                      </span>
                    )}
                  </div>

                  {editingPersonId === p.id ? (
                    <div className="mt-2.5 flex items-center gap-1.5">
                      <input
                        type="text"
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        className="flex-1 px-3 py-1.5 text-xs border border-[#0071e3] rounded-xl focus:outline-none"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSavePersonName(p);
                          if (e.key === 'Escape') setEditingPersonId(null);
                        }}
                      />
                      <button
                        onClick={() => handleSavePersonName(p)}
                        className="p-1.5 bg-[#0071e3] text-white rounded-xl hover:bg-[#0062c4]"
                        title={t.save}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingPersonId(null)}
                        className="p-1.5 bg-stone-100 text-stone-600 rounded-xl hover:bg-stone-200"
                        title={t.cancel}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2.5 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-stone-900">{p.name}</h3>
                      <button
                        onClick={() => handleStartEditPerson(p)}
                        className="p-1 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-[#f5f5f7]"
                        title={ar ? 'تعديل الاسم / تعيين الرمز' : 'Edit name / resolve alias'}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <p className="text-xs text-stone-500 mt-1">{p.role}</p>
                </div>

                <div className="pt-2.5 border-t border-[#d2d2d7]/60 text-[11px] text-stone-600 flex justify-between font-mono">
                  <span>{p.department}</span>
                  <span className="text-stone-400">{p.company}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Projects Directory */}
      {activeTab === 'projects' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((proj) => (
            <div
              key={proj.id}
              className="bg-white p-5 rounded-2xl border border-[#d2d2d7] shadow-xs space-y-3 hover:border-[#0071e3] transition-all"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-[#0071e3] uppercase tracking-wider">
                    {proj.workstream}
                  </span>
                  <h3 className="text-base font-bold text-stone-900 mt-0.5">{proj.name}</h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-xl bg-[#f5f5f7] text-stone-800 border border-[#d2d2d7]">
                    {stageLabel(proj.stage)}
                  </span>
                  <button
                    onClick={() => openProjectForm(proj)}
                    className="p-1 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-[#f5f5f7]"
                    title={t.edit}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {(proj.city || proj.country) && (
                <div className="flex items-center gap-2 text-xs text-stone-600 font-medium">
                  <MapPin className="w-3.5 h-3.5 text-[#0071e3]" />
                  <span>{[proj.city, proj.country].filter(Boolean).join(', ')}</span>
                </div>
              )}

              {proj.notes && (
                <p className="text-xs text-stone-600 bg-[#f5f5f7] p-2.5 rounded-xl border border-[#d2d2d7]/60 leading-relaxed">
                  {proj.notes}
                </p>
              )}

              <div className="pt-2 border-t border-[#d2d2d7]/60 text-xs flex items-center justify-between text-stone-500 font-mono">
                <span>{ar ? 'المسؤول' : 'Lead'}: {proj.lead || '—'}</span>
                <span>{ar ? 'الجهة المقابلة' : 'Counterpart'}: {proj.counterparties || '—'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Departments */}
      {activeTab === 'departments' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {departments.map((dept) => (
            <div
              key={dept}
              className="bg-white p-4 rounded-2xl border border-[#d2d2d7] shadow-xs text-center space-y-1 hover:border-[#0071e3] transition-colors"
            >
              <Building2 className="w-5 h-5 text-[#0071e3] mx-auto mb-2" />
              <h4 className="text-xs font-bold text-stone-900">{dept}</h4>
              <span className="text-[11px] text-stone-400 font-mono">
                {people.filter((p) => p.department === dept).length} {locale === 'ar' ? 'أعضاء' : 'members'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Add Person Modal */}
      {isAddPersonModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-[#d2d2d7] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <h3 className="text-base font-bold text-stone-900">
                {locale === 'ar' ? 'إضافة شخص / رمز تنفيذي' : 'Add Person / Stakeholder Alias'}
              </h3>
              <button
                onClick={() => setIsAddPersonModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePerson} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  {locale === 'ar' ? 'الاسم الكامل *' : 'Full Name *'}
                </label>
                <input
                  type="text"
                  required
                  value={newPersonName}
                  onChange={(e) => setNewPersonName(e.target.value)}
                  placeholder={ar ? 'الاسم الكامل' : 'Full name'}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none focus:border-[#0071e3]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    {locale === 'ar' ? 'الرمز الأولي (Alias)' : 'Initials / Alias'}
                  </label>
                  <input
                    type="text"
                    value={newPersonInitials}
                    onChange={(e) => setNewPersonInitials(e.target.value)}
                    placeholder={ar ? 'الرمز المختصر' : 'Short alias'}
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs font-mono uppercase focus:outline-none focus:border-[#0071e3]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    {locale === 'ar' ? 'الإدارة' : 'Department'}
                  </label>
                  <select
                    value={newPersonDept}
                    onChange={(e) => setNewPersonDept(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none focus:border-[#0071e3]"
                  >
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  {locale === 'ar' ? 'المسمى الوظيفي' : 'Role / Title'}
                </label>
                <input
                  type="text"
                  value={newPersonRole}
                  onChange={(e) => setNewPersonRole(e.target.value)}
                  placeholder={ar ? 'المسمى الوظيفي' : 'Job title'}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none focus:border-[#0071e3]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  {locale === 'ar' ? 'الجهة / المؤسسة' : 'Company / Organization'}
                </label>
                <input
                  type="text"
                  value={newPersonCompany}
                  onChange={(e) => setNewPersonCompany(e.target.value)}
                  placeholder={ar ? 'اسم الجهة' : 'Company or organization'}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none focus:border-[#0071e3]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="verifiedCheck"
                  checked={newPersonVerified}
                  onChange={(e) => setNewPersonVerified(e.target.checked)}
                  className="w-4 h-4 text-[#0071e3] rounded"
                />
                <label htmlFor="verifiedCheck" className="text-xs text-stone-700 font-medium">
                  {locale === 'ar' ? 'اعتماد كرمز موثق ومعروف' : 'Mark alias as verified'}
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setIsAddPersonModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-xl"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#0071e3] hover:bg-[#0062c4] rounded-xl shadow-xs"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Department Modal */}
      {isAddDeptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-[#d2d2d7] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <h3 className="text-base font-bold text-stone-900">
                {locale === 'ar' ? 'إضافة إدارة جديدة' : 'Add New Department'}
              </h3>
              <button
                onClick={() => setIsAddDeptModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDepartment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  {locale === 'ar' ? 'اسم الإدارة *' : 'Department Name *'}
                </label>
                <input
                  type="text"
                  required
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  placeholder={ar ? 'اسم الإدارة' : 'Department name'}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none focus:border-[#0071e3]"
                  autoFocus
                />
                {deptError && <p className="text-[11px] text-red-600 mt-1">{deptError}</p>}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setIsAddDeptModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-xl"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#0071e3] hover:bg-[#0062c4] rounded-xl shadow-xs"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Project Modal */}
      {isAddProjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-[#d2d2d7] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <h3 className="text-base font-bold text-stone-900">
                {editingProject
                  ? ar ? 'تعديل المشروع' : 'Edit Project'
                  : ar ? 'إضافة مشروع جديد' : 'Add New Project'}
              </h3>
              <button
                onClick={() => setIsAddProjectModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  {locale === 'ar' ? 'اسم المشروع *' : 'Project Name *'}
                </label>
                <input
                  type="text"
                  required
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  placeholder={ar ? 'اسم المشروع' : 'Project name'}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none focus:border-[#0071e3]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    {locale === 'ar' ? 'المسار الاستراتيجي' : 'Workstream'}
                  </label>
                  <select
                    value={newProjWorkstream}
                    onChange={(e) => setNewProjWorkstream(e.target.value as Workstream)}
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none focus:border-[#0071e3]"
                  >
                    {INITIAL_WORKSTREAMS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    {locale === 'ar' ? 'المرحلة' : 'Stage'}
                  </label>
                  <select
                    value={newProjStage}
                    onChange={(e) => setNewProjStage(e.target.value as Project['stage'])}
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none focus:border-[#0071e3]"
                  >
                    {(['Pipeline', 'Due Diligence', 'Concession Negotiation', 'EPC / Execution', 'Operational', 'On Hold'] as const).map((st) => (
                      <option key={st} value={st}>
                        {stageLabel(st)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  {locale === 'ar' ? 'مسؤول المشروع' : 'Project Lead'}
                </label>
                <input
                  type="text"
                  value={newProjLead}
                  onChange={(e) => setNewProjLead(e.target.value)}
                  placeholder={ar ? 'اسم مسؤول المشروع' : 'Project lead name'}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none focus:border-[#0071e3]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  {ar ? 'الجهة المقابلة' : 'Counterparty'}
                </label>
                <input
                  type="text"
                  value={newProjCounterparty}
                  onChange={(e) => setNewProjCounterparty(e.target.value)}
                  placeholder={ar ? 'الجهة أو الشريك المقابل' : 'Counterpart entity or partner'}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none focus:border-[#0071e3]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={newProjCity}
                  onChange={(e) => setNewProjCity(e.target.value)}
                  placeholder={ar ? 'المدينة' : 'City'}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none focus:border-[#0071e3]"
                />
                <input
                  type="text"
                  value={newProjCountry}
                  onChange={(e) => setNewProjCountry(e.target.value)}
                  placeholder={ar ? 'الدولة' : 'Country'}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none focus:border-[#0071e3]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  {locale === 'ar' ? 'ملاحظات وتفاصيل' : 'Strategic Notes'}
                </label>
                <textarea
                  rows={3}
                  value={newProjNotes}
                  onChange={(e) => setNewProjNotes(e.target.value)}
                  placeholder={ar ? 'المحطات الرئيسية والأهداف' : 'Key milestones and objectives'}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none focus:border-[#0071e3]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setIsAddProjectModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-xl"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#0071e3] hover:bg-[#0062c4] rounded-xl shadow-xs"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
