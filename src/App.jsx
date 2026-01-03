import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  onSnapshot, 
  updateDoc, 
  serverTimestamp,
  query,
  orderBy,
  deleteDoc,
  writeBatch,
  arrayUnion,
  getDoc
} from 'firebase/firestore';
import { 
  Upload, 
  FileText, 
  Clock, 
  User, 
  Languages, 
  Tag as TagIcon, 
  Plus, 
  X, 
  Save, 
  Search, 
  ChevronRight, 
  ChevronLeft, 
  Users,
  MessageSquare,
  Hash,
  StickyNote,
  Download,
  Check,
  Globe,
  Lock,
  ArrowRight,
  Edit3 // Icon for edit signature
} from 'lucide-react';

// --- Firebase Configuration & Initialization ---

// 使用函式來取得設定，支援環境變數 (Environment Variables) 以利 Vercel 部署
const getFirebaseConfig = () => {
  // 1. 如果是在 Canvas 預覽環境，使用系統提供的變數
  if (typeof __firebase_config !== 'undefined') {
    return JSON.parse(__firebase_config);
  }
  
  // 2. [Vercel 部署專用] 環境變數設定
  // 為了避免在預覽環境報錯，這段預設為註解狀態。
  // ★★★ 重要：上傳到 Vercel 前，請手動將下方的 /* 和 */ 刪除以啟用環境變數 ★★★
  if (import.meta.env && import.meta.env.VITE_FIREBASE_API_KEY) {
    return {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID
    };
  }

const firebaseConfig = getFirebaseConfig();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 淨化 appId，確保路徑合法
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'transcript-lab-demo';
const appId = rawAppId.replace(/\//g, '_');

// --- Helper Functions & Constants ---

const getTagColorClass = (tag) => {
  if (typeof tag !== 'string') return "bg-gray-100 text-gray-800 border-gray-200";
  const colors = [
    "bg-red-100 text-red-800 border-red-200",
    "bg-orange-100 text-orange-800 border-orange-200",
    "bg-amber-100 text-amber-800 border-amber-200",
    "bg-yellow-100 text-yellow-800 border-yellow-200",
    "bg-lime-100 text-lime-800 border-lime-200",
    "bg-green-100 text-green-800 border-green-200",
    "bg-emerald-100 text-emerald-800 border-emerald-200",
    "bg-teal-100 text-teal-800 border-teal-200",
    "bg-cyan-100 text-cyan-800 border-cyan-200",
    "bg-sky-100 text-sky-800 border-sky-200",
    "bg-blue-100 text-blue-800 border-blue-200",
    "bg-indigo-100 text-indigo-800 border-indigo-200",
    "bg-violet-100 text-violet-800 border-violet-200",
    "bg-purple-100 text-purple-800 border-purple-200",
    "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
    "bg-pink-100 text-pink-800 border-pink-200",
    "bg-rose-100 text-rose-800 border-rose-200",
  ];
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

// --- 免費翻譯 API (MyMemory) ---
const fetchRealTranslation = async (text) => {
    try {
        const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=zh-TW|en`);
        const data = await response.json();
        
        if (data && data.responseData && data.responseData.translatedText) {
            return data.responseData.translatedText;
        }
        return null;
    } catch (error) {
        console.error("Translation API Error:", error);
        return null; 
    }
};

const parseTranscriptText = (text) => {
  const segments = [];
  const blocks = text.trim().split(/\n\n+/);
  
  blocks.forEach((block, index) => {
    const lines = block.split('\n');
    if (lines.length >= 3) {
      const timeLine = lines[1];
      const contentLine = lines.slice(2).join(' '); 
      
      const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/);
      const speakerMatch = contentLine.match(/^([A-Z0-9]+):\s*(.*)/);

      if (timeMatch) {
        const originalText = speakerMatch ? speakerMatch[2] : contentLine;
        
        segments.push({
          id: `seg-${Date.now()}-${index}`, 
          index: parseInt(lines[0]),
          startTime: timeMatch[1],
          endTime: timeMatch[2],
          speaker: speakerMatch ? speakerMatch[1] : 'Unknown',
          originalText: originalText,
          translatedText: "", 
          note: '', 
          tags: []
        });
      }
    }
  });
  return segments;
};

// --- Components ---

const TagBadge = ({ label, meta, onRemove }) => {
  const colorClass = getTagColorClass(label);
  
  // 建立提示文字：顯示這標籤是誰加的
  const titleText = meta ? `Added by ${meta.by}` : "No author info";

  return (
    <span 
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colorClass} mr-1 mb-1 cursor-help`}
      title={titleText} // Native tooltip
    >
      {label}
      {onRemove && (
        <button onClick={onRemove} className="ml-1 text-opacity-60 hover:text-opacity-100 focus:outline-none">
          <X size={12} />
        </button>
      )}
    </span>
  );
};

const SegmentRow = ({ seg, projectTags, onUpdateTranslation, onUpdateNote, onAddTag, onRemoveTag, onCreateTag, onTriggerTranslate }) => {
  const [localTagInput, setLocalTagInput] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false); 
  const dropdownRef = useRef(null);
  
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const handleCreateLocal = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (localTagInput.trim()) {
      onCreateTag(localTagInput.trim(), seg.id, seg.tags);
      setLocalTagInput('');
      setIsDropdownOpen(false);
    }
  };

  const handleTranslateClick = async () => {
      setIsTranslating(true);
      await onTriggerTranslate(seg.id, seg.originalText);
      setIsTranslating(false);
  };

  const safeTags = Array.isArray(seg.tags) ? seg.tags : [];
  // 取得標籤的 metadata (誰新增的)
  const tagsMeta = seg.tagsMeta || {};

  return (
    <div className="grid grid-cols-12 gap-4 bg-white p-4 rounded-lg shadow-sm border border-slate-200 hover:shadow-md transition-shadow group">
      {/* Time & Speaker */}
      <div className="col-span-1 flex flex-col items-center justify-start text-center border-r border-slate-100 pr-2">
        <div className="w-8 h-8 rounded-full bg-[#011F5B]/10 text-[#011F5B] flex items-center justify-center font-bold text-sm mb-2">
          {seg.speaker}
        </div>
        <div className="text-[10px] text-slate-400 font-mono leading-tight">
          {seg.startTime}<br/>
          ↓<br/>
          {seg.endTime}
        </div>
      </div>

      {/* Content */}
      <div className="col-span-3 text-slate-800 leading-relaxed font-medium text-sm">
        {seg.originalText}
      </div>

      {/* Translation */}
      <div className="col-span-3">
        <div className="relative h-full">
          <textarea 
            className="w-full h-full min-h-[100px] p-2 text-sm border border-slate-200 rounded-md focus:border-[#011F5B] focus:ring-1 focus:ring-[#011F5B] transition-all bg-slate-50 hover:bg-white resize-none"
            placeholder="Translation..."
            value={seg.translatedText || ''}
            onChange={(e) => onUpdateTranslation(seg.id, e.target.value)}
          />
           <div className="absolute top-1 right-2 opacity-100">
                <button 
                    title="Translate with Free AI"
                    onClick={handleTranslateClick}
                    disabled={isTranslating}
                    className="text-slate-300 hover:text-[#011F5B] transition-colors p-1 bg-white/80 rounded-full"
                >
                    {isTranslating ? (
                        <div className="animate-spin h-3 w-3 border-2 border-[#011F5B] border-t-transparent rounded-full"></div>
                    ) : (
                        <Globe size={14} />
                    )}
                </button>
            </div>
        </div>
      </div>

      {/* Tags */}
      <div className="col-span-2 flex flex-col justify-between border-l border-slate-100 pl-2">
        <div className="flex flex-wrap content-start">
          {safeTags.map(tag => (
            <TagBadge 
              key={tag} 
              label={tag} 
              meta={tagsMeta[tag]} // 傳入這標籤的作者資訊
              onRemove={() => onRemoveTag(seg.id, safeTags, tag)}
            />
          ))}
          
          <div className="relative w-full mt-2" ref={dropdownRef}>
              <button 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`text-xs flex items-center transition-colors px-1 py-0.5 rounded ${isDropdownOpen ? 'text-[#011F5B] bg-[#011F5B]/5 font-semibold' : 'text-slate-400 hover:text-[#011F5B]'}`}
              >
                <Plus size={12} className="mr-1"/> Add Tag
              </button>
              
              {isDropdownOpen && (
                <div className="absolute top-full left-0 bg-white border border-slate-200 shadow-xl rounded-md z-50 w-48 p-2 max-h-64 overflow-y-auto mt-1">
                  <div className="mb-2 pb-2 border-b border-slate-100 flex items-center">
                    <input 
                      type="text"
                      className="w-full px-2 py-1 text-xs border border-slate-200 rounded-l focus:outline-none focus:border-[#011F5B]"
                      placeholder="Create new tag..."
                      value={localTagInput}
                      onChange={(e) => setLocalTagInput(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      onKeyDown={(e) => {
                        if(e.key === 'Enter') handleCreateLocal(e);
                      }}
                    />
                    <button 
                      onClick={handleCreateLocal}
                      className="bg-[#011F5B] text-white px-2 py-1 rounded-r text-xs hover:bg-[#011F5B]/90"
                    >
                      <Plus size={12} />
                    </button>
                  </div>

                  <div className="text-[10px] text-slate-400 px-1 py-1 uppercase tracking-wider">Select Existing</div>
                  {projectTags.filter(t => !safeTags.includes(t)).map(t => (
                    <button 
                      key={t}
                      onClick={() => {
                        onAddTag(seg.id, safeTags, t);
                        setIsDropdownOpen(false);
                      }}
                      className="block w-full text-left px-2 py-1.5 text-xs hover:bg-[#011F5B]/10 hover:text-[#011F5B] rounded text-slate-700 flex items-center"
                    >
                      <div className={`w-2 h-2 rounded-full mr-2 ${getTagColorClass(t).split(' ')[0]}`}></div>
                      {t}
                    </button>
                  ))}
                </div>
              )}
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="col-span-3">
          <div className="relative h-full flex flex-col">
            <div className="relative flex-1">
              <div className="absolute top-2 left-2 text-[#990000]/30 pointer-events-none">
                  <StickyNote size={14} />
              </div>
              <textarea 
                className="w-full h-full min-h-[100px] pl-8 p-2 text-sm border border-[#990000]/10 bg-[#990000]/5 rounded-md focus:border-[#990000] focus:ring-1 focus:ring-[#990000] transition-all resize-none placeholder:text-[#990000]/30 text-slate-700"
                placeholder="Add note for team..."
                value={seg.note || ''}
                onChange={(e) => onUpdateNote(seg.id, e.target.value)}
              />
            </div>
            {/* 筆記簽名檔：顯示最後編輯者 */}
            {seg.noteMeta && (
              <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-end px-1">
                <Edit3 size={8} className="mr-1"/>
                {seg.noteMeta.by} 
                {/* 簡單的時間顯示 */}
                {seg.noteMeta.at?.toDate ? ` (${new Date(seg.noteMeta.at.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})` : ''}
              </div>
            )}
          </div>
      </div>

    </div>
  );
};

const TranscriptUploader = ({ onUpload }) => {
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');

  const handleParse = () => {
    if (!text || !title) return;
    const parsedData = parseTranscriptText(text);
    onUpload(title, parsedData);
    setText('');
    setTitle('');
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
      <h3 className="text-lg font-semibold text-[#011F5B] mb-4 flex items-center">
        <Upload className="w-5 h-5 mr-2" />
        New Project Import
      </h3>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Project Title</label>
          <input 
            type="text" 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-[#011F5B] focus:border-[#011F5B]"
            placeholder="e.g., Teacher Interview 2024"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Paste Transcript Content
          </label>
          <textarea 
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full h-48 px-3 py-2 border border-slate-300 rounded-md font-mono text-sm focus:ring-2 focus:ring-[#011F5B] focus:border-[#011F5B]"
            placeholder="Paste your transcript text here..."
          />
          <p className="text-xs text-slate-500 mt-1 italic">
            * 預設使用免費翻譯 (MyMemory)。點擊地球圖示即可翻譯該行。
          </p>
        </div>

        <div className="flex space-x-3">
          <button 
            onClick={handleParse}
            disabled={!text || !title}
            className="flex-1 bg-[#011F5B] text-white px-4 py-2 rounded-md hover:bg-[#011F5B]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
          >
            Create Project
          </button>
        </div>
      </div>
    </div>
  );
};

const TranscriptEditor = ({ transcriptId, transcriptData, onClose, user, teamId, displayName }) => {
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [projectTags, setProjectTags] = useState([]); 
  const [newTagInput, setNewTagInput] = useState('');
  const [filterTag, setFilterTag] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // 路徑邏輯：如果有 Team ID 就用 Team 路徑，否則用 User 路徑
  const getBasePath = () => {
    if (teamId && teamId.trim() !== '') {
      return `artifacts/${appId}/teams/${teamId.trim()}`;
    }
    return `artifacts/${appId}/users/${user.uid}`;
  };

  // 1. 監聽段落資料
  useEffect(() => {
    if (!transcriptId || !user) return;
    
    const q = query(
      collection(db, `${getBasePath()}/transcripts/${transcriptId}/segments`),
      orderBy('index')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const segs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            ...data,
            id: doc.id, 
            note: data.note || '',
            tagsMeta: data.tagsMeta || {} // 讀取標籤 metadata
        };
      });
      setSegments(segs);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching segments:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [transcriptId, user, teamId]); 

  // 2. 監聽專案標籤庫
  useEffect(() => {
    if (!transcriptId) return;

    const docRef = doc(db, `${getBasePath()}/transcripts`, transcriptId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.availableTags) {
          setProjectTags(data.availableTags);
        } else {
          setProjectTags(['Important', 'Education', 'Emotion']); 
        }
      }
    });

    return () => unsubscribe();
  }, [transcriptId, teamId]);

  // 更新資料的通用函式
  const updateSegment = async (segId, data) => {
      const ref = doc(db, `${getBasePath()}/transcripts/${transcriptId}/segments`, segId);
      await updateDoc(ref, data);
  };

  const handleUpdateTranslation = async (segId, newText) => {
    await updateSegment(segId, { translatedText: newText });
  };

  const handleUpdateNote = async (segId, newNote) => {
    // 同時更新內容和作者資訊
    await updateSegment(segId, { 
      note: newNote,
      noteMeta: {
        by: displayName || 'Anonymous',
        at: serverTimestamp()
      }
    });
  };

  const handleAddTagToSegment = async (segId, currentTags, tagToAdd) => {
    if (currentTags.includes(tagToAdd)) return;
    
    // 更新陣列與 Metadata Map (使用點符號語法來更新 Map 中的特定 key)
    const ref = doc(db, `${getBasePath()}/transcripts/${transcriptId}/segments`, segId);
    await updateDoc(ref, {
      tags: arrayUnion(tagToAdd),
      [`tagsMeta.${tagToAdd}`]: { // 記錄這個標籤是誰加的
        by: displayName || 'Anonymous',
        at: serverTimestamp()
      }
    });
  };

  const handleRemoveTagFromSegment = async (segId, currentTags, tagToRemove) => {
    // 移除時我們只從陣列移除，Metadata 可以留著或透過 deleteField() 刪除
    // 這裡簡單從陣列移除即可
    await updateSegment(segId, { tags: currentTags.filter(t => t !== tagToRemove) });
  };

  const handleCreateAndAddTag = async (newTag, segId, currentTags) => {
     if (!newTag) return;
     
     if (!projectTags.includes(newTag)) {
        const docRef = doc(db, `${getBasePath()}/transcripts`, transcriptId);
        await updateDoc(docRef, {
            availableTags: arrayUnion(newTag)
        });
     }
     await handleAddTagToSegment(segId, currentTags, newTag);
  };

  const handleAddNewGlobalTag = async () => {
    if (newTagInput && !projectTags.includes(newTagInput)) {
      const ref = doc(db, `${getBasePath()}/transcripts`, transcriptId);
      await updateDoc(ref, {
        availableTags: arrayUnion(newTagInput)
      });
      setNewTagInput('');
    }
  };

  const handleTriggerRealTranslation = async (segId, originalText) => {
      const translation = await fetchRealTranslation(originalText);
      if (translation) {
          await handleUpdateTranslation(segId, translation);
      }
  };

  // 匯出 CSV
  const handleExportCSV = () => {
    if (!segments.length) return;

    const headers = ['Index', 'Start Time', 'End Time', 'Speaker', 'Original Text', 'English Translation', 'Tags', 'Team Notes', 'Last Edited By'];
    
    const csvRows = segments.map(seg => {
      const tagsString = (seg.tags || []).join('; ');
      const safe = (str) => `"${(str || '').replace(/"/g, '""')}"`;
      const editor = seg.noteMeta ? seg.noteMeta.by : '';

      return [
        seg.index,
        safe(seg.startTime),
        safe(seg.endTime),
        safe(seg.speaker),
        safe(seg.originalText),
        safe(seg.translatedText),
        safe(tagsString),
        safe(seg.note),
        safe(editor)
      ].join(',');
    });

    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${transcriptData.title.replace(/\s+/g, '_')}_coded.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredSegments = segments.filter(seg => {
    const matchesSearch = seg.originalText.includes(searchTerm) || seg.translatedText.toLowerCase().includes(searchTerm.toLowerCase()) || seg.note?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTag = filterTag ? seg.tags.includes(filterTag) : true;
    return matchesSearch && matchesTag;
  });

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header Toolbar */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <div className="flex items-center">
          <button onClick={onClose} className="mr-4 p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ChevronLeft className="w-5 h-5 text-[#011F5B]" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-[#011F5B]">{transcriptData.title}</h2>
            <div className="flex items-center text-xs text-slate-500 space-x-4 mt-1">
              <span className="flex items-center"><Clock size={12} className="mr-1"/> Synced</span>
              {teamId ? (
                <span className="flex items-center text-indigo-700 bg-indigo-100 px-2 rounded-full"><Users size={10} className="mr-1"/> Team: {teamId}</span>
              ) : (
                <span className="flex items-center text-green-700 bg-green-100 px-2 rounded-full"><Lock size={10} className="mr-1"/> Private Workspace</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
           <div className="flex items-center space-x-1 mr-4 border-r border-slate-200 pr-4">
              <Search className="w-4 h-4 text-slate-400" />
              <input 
                placeholder="Search text, notes..." 
                className="text-sm border-none focus:ring-0 bg-transparent"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
           </div>
           
           <select 
             className="text-sm border-slate-300 rounded-md focus:ring-[#011F5B]"
             onChange={(e) => setFilterTag(e.target.value || null)}
             value={filterTag || ''}
           >
             <option value="">All Tags</option>
             {projectTags.map(t => <option key={t} value={t}>{t}</option>)}
           </select>

           <button 
             onClick={handleExportCSV}
             className="flex items-center px-3 py-2 bg-[#011F5B] text-white text-sm rounded-md hover:bg-[#011F5B]/90 transition-colors shadow-sm ml-2"
             title="Download full project data as CSV"
           >
             <Download size={14} className="mr-2" />
             Export Data
           </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex justify-center items-center h-64 text-[#011F5B]">Loading workspace...</div>
        ) : (
          <div className="space-y-4 max-w-[1400px] mx-auto">
            {/* Headers */}
            <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-bold text-[#011F5B] uppercase tracking-wider bg-white/50 rounded-lg mb-2">
              <div className="col-span-1">Info</div>
              <div className="col-span-3">Original Text (ZH)</div>
              <div className="col-span-3">English Translation</div>
              <div className="col-span-2">Tags</div>
              <div className="col-span-3">Team Notes</div>
            </div>

            {filteredSegments.map((seg) => (
              <SegmentRow 
                key={seg.id}
                seg={seg}
                projectTags={projectTags}
                onUpdateTranslation={handleUpdateTranslation}
                onUpdateNote={handleUpdateNote}
                onAddTag={handleAddTagToSegment}
                onRemoveTag={handleRemoveTagFromSegment}
                onCreateTag={handleCreateAndAddTag}
                onTriggerTranslate={handleTriggerRealTranslation} 
              />
            ))}

            {filteredSegments.length === 0 && (
               <div className="text-center py-12 text-slate-400">
                 <p>No segments found matching your criteria.</p>
               </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Tag Manager */}
      <div className="bg-white border-t border-slate-200 px-6 py-4 shadow-lg z-20">
         <div className="flex items-center justify-between">
             <div className="flex items-center flex-1 overflow-hidden">
                <Hash className="text-[#011F5B] w-4 h-4 mr-2 flex-shrink-0" />
                <span className="font-bold text-[#011F5B] text-sm mr-4 flex-shrink-0">Global Codebook:</span>
                
                <div className="flex space-x-2 overflow-x-auto pb-1 scrollbar-hide">
                  {projectTags.map(tag => (
                     <span key={tag} className={`px-2 py-1 rounded text-xs whitespace-nowrap border ${getTagColorClass(tag)}`}>
                        {tag}
                     </span>
                  ))}
                </div>
             </div>
             
             {/* Add New Tag Section */}
             <div className="flex items-center ml-4 border-l border-slate-200 pl-4 flex-shrink-0">
               <input 
                 type="text" 
                 placeholder="New Global Code..." 
                 className="w-32 px-2 py-1.5 text-sm border border-slate-300 rounded-l-md focus:border-[#011F5B] focus:ring-[#011F5B] focus:outline-none"
                 value={newTagInput}
                 onChange={e => setNewTagInput(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && handleAddNewGlobalTag()}
               />
               <button 
                onClick={handleAddNewGlobalTag} 
                className="bg-[#011F5B] text-white px-3 py-1.5 rounded-r-md text-sm hover:bg-[#011F5B]/90 flex items-center font-medium"
               >
                 <Plus size={14} className="mr-1"/> Add
               </button>
             </div>
         </div>
      </div>
    </div>
  );
};

const Dashboard = ({ onSelectTranscript, user, teamId, setTeamId, displayName, setDisplayName }) => {
  const [transcripts, setTranscripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inputTeamId, setInputTeamId] = useState(teamId || '');
  const [inputName, setInputName] = useState(displayName || '');

  // 路徑邏輯：如果有 Team ID 就用 Team 路徑，否則用 User 路徑
  const getBasePath = () => {
    if (teamId && teamId.trim() !== '') {
      return `artifacts/${appId}/teams/${teamId.trim()}`;
    }
    return `artifacts/${appId}/users/${user.uid}`;
  };

  useEffect(() => {
    if (!user) return;
    
    const q = query(
      collection(db, `${getBasePath()}/transcripts`),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTranscripts(data);
      setLoading(false);
    }, (err) => {
      console.error("Dashboard error:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, teamId]); // 當 teamId 改變時重新監聽

  const handleUpload = async (title, segments) => {
    const docRef = await addDoc(collection(db, `${getBasePath()}/transcripts`), {
      title: title,
      createdAt: serverTimestamp(),
      createdBy: user.uid,
      segmentCount: segments.length,
      availableTags: ['Education', 'Emotion', 'Background', 'Question', 'Agreement', 'Important']
    });

    const batch = writeBatch(db);
    segments.forEach((seg) => {
      const segRef = doc(collection(db, `${getBasePath()}/transcripts/${docRef.id}/segments`));
      batch.set(segRef, seg);
    });
    await batch.commit();
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if(window.confirm("Are you sure? This will delete the project metadata.")) {
        await deleteDoc(doc(db, `${getBasePath()}/transcripts`, id));
    }
  }

  // 日期格式化 helper
  const formatDate = (timestamp) => {
    if (!timestamp) return 'Just now';
    if (timestamp.toDate) return new Date(timestamp.toDate()).toLocaleDateString();
    if (timestamp.seconds) return new Date(timestamp.seconds * 1000).toLocaleDateString();
    return 'Unknown date';
  };

  const handleSettingsSubmit = (e) => {
    e.preventDefault();
    setTeamId(inputTeamId);
    setDisplayName(inputName);
    // 簡單持久化設定 (非必要，但使用者體驗較佳)
    localStorage.setItem('transcript_lab_name', inputName);
    localStorage.setItem('transcript_lab_team', inputTeamId);
  }

  return (
    <div className="max-w-5xl mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-extrabold text-[#011F5B] tracking-tight">Transcript Lab</h1>
          <p className="mt-2 text-lg text-slate-600">Collaborative Qualitative Analysis & Translation Tool</p>
        </div>
        
        {/* Team & User Settings */}
        <form onSubmit={handleSettingsSubmit} className="flex flex-col items-end gap-2">
           <div className="flex items-center bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
             <User size={14} className="text-slate-400 mr-2"/>
             <input 
               type="text" 
               placeholder="Your Name (e.g. Alice)" 
               className="text-sm px-2 py-1 border border-slate-300 rounded focus:ring-[#011F5B] focus:border-[#011F5B] w-40 mr-2"
               value={inputName}
               onChange={e => setInputName(e.target.value)}
               required
             />
             <span className="text-slate-300 mx-1">|</span>
             <span className="text-xs font-bold text-slate-500 uppercase mx-2 tracking-wider">
               {teamId ? 'Team' : 'Private'}
             </span>
             <input 
               type="text" 
               placeholder="Team ID (Optional)" 
               className="text-sm px-2 py-1 border border-slate-300 rounded focus:ring-[#011F5B] focus:border-[#011F5B] w-40"
               value={inputTeamId}
               onChange={e => setInputTeamId(e.target.value)}
             />
             <button type="submit" className="ml-2 bg-[#011F5B] text-white p-1.5 rounded hover:bg-[#011F5B]/90">
               <ArrowRight size={16} />
             </button>
           </div>
           {teamId && (
             <div className="text-xs text-indigo-600">
               Viewing Team: <b>{teamId}</b> as <b>{displayName || 'Anonymous'}</b>
             </div>
           )}
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <TranscriptUploader onUpload={handleUpload} />
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className={`px-6 py-4 border-b border-slate-100 flex justify-between items-center ${teamId ? 'bg-indigo-50' : 'bg-slate-50'}`}>
              <h3 className="font-semibold text-[#011F5B] flex items-center">
                <FileText className="w-4 h-4 mr-2" />
                {teamId ? `Team Projects: ${teamId}` : 'My Projects'}
              </h3>
              <span className="text-xs font-medium text-[#011F5B] bg-[#011F5B]/10 px-2 py-1 rounded-full">{transcripts.length}</span>
            </div>
            
            {loading ? (
              <div className="p-8 text-center text-slate-400">Syncing...</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {transcripts.map((t) => (
                  <li key={t.id} onClick={() => onSelectTranscript(t)} className="p-4 hover:bg-[#011F5B]/5 transition-colors cursor-pointer group">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="font-medium text-[#011F5B] group-hover:underline">{t.title}</h4>
                        <div className="flex items-center text-xs text-slate-500 mt-1 space-x-3">
                           <span>{formatDate(t.createdAt)}</span>
                           <span>•</span>
                           <span>{t.segmentCount} Segments</span>
                           <span className="text-xs bg-slate-100 px-1 rounded">by {t.createdBy?.slice(0,4)}..</span>
                        </div>
                      </div>
                      <div className="flex items-center">
                         <button onClick={(e) => handleDelete(e, t.id)} className="p-2 text-slate-300 hover:text-[#990000] transition-colors">
                            <X size={16} />
                         </button>
                         <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-[#011F5B]" />
                      </div>
                    </div>
                  </li>
                ))}
                {transcripts.length === 0 && (
                  <li className="p-8 text-center text-slate-400 italic">
                    {teamId ? `No projects in Team "${teamId}" yet.` : "No transcripts yet."}
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTranscript, setActiveTranscript] = useState(null);
  const [teamId, setTeamId] = useState(() => localStorage.getItem('transcript_lab_team') || ''); 
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('transcript_lab_name') || '');

  useEffect(() => {
    const initAuth = async () => {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  if (!user) {
    return <div className="h-screen w-screen flex items-center justify-center bg-slate-50 text-[#011F5B]">Initializing Secure Workspace...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {activeTranscript ? (
        <TranscriptEditor 
          transcriptId={activeTranscript.id} 
          transcriptData={activeTranscript} 
          onClose={() => setActiveTranscript(null)} 
          user={user}
          teamId={teamId} 
          displayName={displayName} // 傳遞使用者名稱
        />
      ) : (
        <Dashboard 
          onSelectTranscript={setActiveTranscript} 
          user={user} 
          teamId={teamId} 
          setTeamId={setTeamId}
          displayName={displayName}
          setDisplayName={setDisplayName}
        />
      )}
    </div>
  );
}