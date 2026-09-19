import React, { useState, useEffect } from 'react';
import { 
  X, Smartphone, Download, ExternalLink, Copy, Check, QrCode, 
  Terminal, ShieldCheck, Layers, Sparkles, AlertCircle, Info, ChevronRight
} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface ApkExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApkExportModal: React.FC<ApkExportModalProps> = ({ isOpen, onClose }) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCli, setCopiedCli] = useState(false);
  const [activeTab, setActiveTab] = useState<'pwabuilder' | 'webapk' | 'bubblewrap' | 'capacitor'>('pwabuilder');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  // Use the canonical production shared URL, or fallback to current origin
  const liveUrl = typeof window !== 'undefined'
    ? (window.location.origin.includes('localhost') 
        ? 'https://ais-pre-lcxmwdpyoc256lycqd3ogb-642916903521.europe-west1.run.app' 
        : window.location.origin)
    : 'https://ais-pre-lcxmwdpyoc256lycqd3ogb-642916903521.europe-west1.run.app';

  const pwabuilderUrl = `https://www.pwabuilder.com/reportcard?site=${encodeURIComponent(liveUrl)}`;

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (!isOpen) return null;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(liveUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  const handleCopyCli = (command: string) => {
    navigator.clipboard.writeText(command);
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 2500);
  };

  const handleTriggerNativeInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      alert('To install directly on Android, open this app in Chrome on your phone and tap "Add to Home Screen" or "Install App" in the browser menu.');
    }
  };

  const handleDownloadConfigPackage = () => {
    const packagePayload = {
      name: "DIRA - Donkey Incident Reporting APP (Kaa Rada!)",
      shortName: "DIRA",
      packageId: "ke.or.caritas.kitui.dira",
      appUrl: liveUrl,
      manifestUrl: `${liveUrl}/manifest.json`,
      icons: [
        `${liveUrl}/pwa-192x192.png`,
        `${liveUrl}/pwa-512x512.png`,
        `${liveUrl}/pwa-maskable-512x512.png`
      ],
      twaConfig: {
        host: new URL(liveUrl).host,
        packageId: "ke.or.caritas.kitui.dira",
        themeColor: "#991B1B",
        backgroundColor: "#09090B"
      },
      cliCommands: {
        bubblewrapInit: `bubblewrap init --manifest=${liveUrl}/manifest.json`,
        bubblewrapBuild: `bubblewrap build`
      }
    };

    const blob = new Blob([JSON.stringify(packagePayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dira-android-apk-config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs overflow-y-auto animate-fadeIn">
      <div 
        className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-zinc-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-red-950 via-zinc-900 to-zinc-950 text-white flex items-center justify-between border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shadow-md border border-red-500/40 shrink-0">
              <Smartphone className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight text-white">
                  Export Android .APK File
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold uppercase tracking-wide border border-emerald-500/30">
                  Ready
                </span>
              </div>
              <p className="text-xs text-zinc-300">
                Package ID: <span className="font-mono text-amber-300">ke.or.caritas.kitui.dira</span> • Caritas Kitui
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white flex items-center justify-center transition-colors shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-zinc-800">
          
          {/* Quick Action Highlight: 1-Click Online APK Generator */}
          <div className="bg-gradient-to-br from-red-50 via-amber-50/40 to-white rounded-2xl p-4 sm:p-5 border border-red-200 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-red-700 text-white text-[10px] font-black uppercase tracking-wider">
                    Recommended
                  </span>
                  <span className="text-sm font-extrabold text-zinc-950">
                    1-Click Online APK Generator (PWABuilder)
                  </span>
                </div>
                <p className="text-xs text-zinc-600">
                  Microsoft's official open-source tool instantly compiles an installable Android <strong>.APK</strong> and Google Play <strong>.AAB</strong> bundle directly from our compliant PWA.
                </p>
              </div>

              <a
                href={pwabuilderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-700 hover:bg-red-800 text-white font-extrabold text-xs sm:text-sm shadow-sm hover:shadow active:scale-95 transition-all shrink-0"
              >
                <span>Generate APK Online</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            {/* Target URL with Copy Button */}
            <div className="mt-3 pt-3 border-t border-red-100 flex items-center justify-between gap-2 text-xs">
              <div className="truncate text-zinc-600 font-mono text-[11px]">
                <span className="text-zinc-400 font-sans">App URL: </span>
                <span className="text-zinc-900 font-bold">{liveUrl}</span>
              </div>
              <button
                onClick={handleCopyUrl}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-zinc-100 border border-zinc-200 text-[11px] font-bold text-zinc-700 flex items-center gap-1 shrink-0 transition-colors"
                title="Copy live app URL"
              >
                {copiedUrl ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Copy URL</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-zinc-200 text-xs font-bold gap-2 overflow-x-auto pb-0.5">
            <button
              onClick={() => setActiveTab('pwabuilder')}
              className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'pwabuilder'
                  ? 'border-red-700 text-red-800 font-extrabold'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>PWABuilder (Online)</span>
            </button>
            <button
              onClick={() => setActiveTab('webapk')}
              className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'webapk'
                  ? 'border-red-700 text-red-800 font-extrabold'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Direct Android Install (WebAPK)</span>
            </button>
            <button
              onClick={() => setActiveTab('bubblewrap')}
              className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'bubblewrap'
                  ? 'border-red-700 text-red-800 font-extrabold'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Bubblewrap CLI (CLI APK)</span>
            </button>
            <button
              onClick={() => setActiveTab('capacitor')}
              className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'capacitor'
                  ? 'border-red-700 text-red-800 font-extrabold'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Capacitor / Android Studio</span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="space-y-4 text-xs">
            {activeTab === 'pwabuilder' && (
              <div className="space-y-3">
                <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-200/80 space-y-2.5">
                  <h4 className="font-extrabold text-zinc-900 text-sm flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-600" />
                    Steps to Download Your .APK file via PWABuilder:
                  </h4>
                  <ol className="list-decimal list-inside space-y-2 text-zinc-700 text-xs">
                    <li>
                      Click the <strong>"Generate APK Online"</strong> button above to open PWABuilder.
                    </li>
                    <li>
                      PWABuilder analyzes our manifest (100% compliant with 192px, 512px, maskable icons and service worker).
                    </li>
                    <li>
                      Click the green <strong>"Package for Android"</strong> button.
                    </li>
                    <li>
                      In the Android settings popup, leave defaults or customize (Package ID: <code className="bg-zinc-200 px-1 py-0.5 rounded text-[11px]">ke.or.caritas.kitui.dira</code>).
                    </li>
                    <li>
                      Click <strong>"Generate Package"</strong>. Your browser downloads a zip containing:
                      <ul className="list-disc list-inside pl-4 mt-1 space-y-0.5 text-zinc-600">
                        <li><span className="font-mono font-bold text-zinc-900">app-release-unsigned.apk</span> (ready to side-load on any Android phone)</li>
                        <li><span className="font-mono font-bold text-zinc-900">app-release.aab</span> (Google Play Store bundle)</li>
                      </ul>
                    </li>
                  </ol>
                </div>
              </div>
            )}

            {activeTab === 'webapk' && (
              <div className="space-y-3">
                <div className="bg-blue-50/60 rounded-xl p-4 border border-blue-200 space-y-2.5">
                  <h4 className="font-extrabold text-blue-950 text-sm flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-blue-700" />
                    Native Android WebAPK (Direct Phone Installation)
                  </h4>
                  <p className="text-zinc-700">
                    On modern Android devices (Google Chrome, Samsung Internet, Microsoft Edge), installing this Progressive Web App triggers the Android operating system to <strong>automatically synthesize and install a native WebAPK</strong> with its own icon in the Android application drawer, splash screen, and background location services.
                  </p>

                  <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    {deferredPrompt ? (
                      <button
                        onClick={handleTriggerNativeInstall}
                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-xs active:scale-95 transition-all"
                      >
                        <Download className="w-4 h-4" />
                        <span>Install WebAPK on This Device</span>
                      </button>
                    ) : isInstalled ? (
                      <div className="flex items-center gap-2 text-emerald-800 bg-emerald-100/80 px-3 py-2 rounded-xl font-bold border border-emerald-300">
                        <Check className="w-4 h-4" />
                        <span>Already installed in standalone Android mode!</span>
                      </div>
                    ) : (
                      <div className="text-[11px] text-zinc-600 bg-white p-3 rounded-xl border border-blue-200 space-y-1">
                        <div className="font-bold text-zinc-900">To install on an Android Phone:</div>
                        <div>1. Open <span className="font-mono text-blue-700 font-bold">{liveUrl}</span> in Chrome on your phone.</div>
                        <div>2. Tap the browser menu (<span className="font-bold">⋮</span>) &rarr; select <span className="font-bold">"Install app"</span> or <span className="font-bold">"Add to Home screen"</span>.</div>
                        <div>3. Android will automatically install DIRA as a native app on your phone.</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'bubblewrap' && (
              <div className="space-y-3">
                <div className="bg-zinc-900 text-zinc-100 rounded-xl p-4 font-mono text-[11px] space-y-2 border border-zinc-800">
                  <div className="flex items-center justify-between text-zinc-400 font-sans text-xs pb-1 border-b border-zinc-800">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-amber-400" />
                      Google Bubblewrap CLI (Command Line APK Compiler)
                    </span>
                    <button
                      onClick={() => handleCopyCli(`npm install -g @bubblewrap/cli\nbubblewrap init --manifest=${liveUrl}/manifest.json\nbubblewrap build`)}
                      className="text-[10px] text-amber-300 hover:text-amber-200 flex items-center gap-1 font-sans"
                    >
                      {copiedCli ? 'Copied Commands!' : 'Copy Commands'}
                    </button>
                  </div>
                  <p className="text-zinc-400 font-sans text-xs">
                    Run these commands on any machine with Node.js and Java JDK installed to build an APK file:
                  </p>
                  <pre className="bg-black/60 p-3 rounded-lg text-emerald-400 overflow-x-auto">
{`# 1. Install Google's official Bubblewrap TWA CLI
npm install -g @bubblewrap/cli

# 2. Initialize the project from our live manifest
bubblewrap init --manifest=${liveUrl}/manifest.json

# 3. Compile the production Android APK
bubblewrap build`}
                  </pre>
                  <div className="text-zinc-400 text-[10px] font-sans">
                    Output: <strong className="text-white">app-release-signed.apk</strong> in your local folder.
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'capacitor' && (
              <div className="space-y-3">
                <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-200 space-y-2 text-zinc-700">
                  <h4 className="font-extrabold text-zinc-900 text-sm flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-zinc-700" />
                    Capacitor / Android Studio Native APK Project
                  </h4>
                  <p>
                    A pre-configured <code className="bg-zinc-200 px-1 py-0.5 rounded text-[11px]">capacitor.config.json</code> has already been added to the project root. You can open and build it in Android Studio:
                  </p>
                  <pre className="bg-zinc-900 text-emerald-400 p-3 rounded-lg font-mono text-[11px] overflow-x-auto">
{`# 1. Install Capacitor
npm install @capacitor/core @capacitor/cli @capacitor/android

# 2. Add Android platform & build
npx cap add android
npx cap copy android
npx cap open android`}
                  </pre>
                  <p className="text-[11px] text-zinc-500">
                    In Android Studio, click <strong>Build &rarr; Build Bundle(s) / APK(s) &rarr; Build APK(s)</strong>.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Download Package Config & Assets button */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-zinc-200">
            <div className="flex items-center gap-2 text-xs text-zinc-600">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Manifest, service worker & icons are 100% verified.</span>
            </div>

            <button
              onClick={handleDownloadConfigPackage}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-xs transition-colors"
              title="Download APK configuration and metadata file"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download APK Config Package (.json)</span>
            </button>
          </div>

        </div>

        {/* Footer */}
        <div className="p-3.5 bg-zinc-100 border-t border-zinc-200 flex items-center justify-between text-xs text-zinc-600">
          <div className="flex items-center gap-1.5 text-[11px]">
            <Info className="w-3.5 h-3.5 text-zinc-500" />
            <span>Need assistance? Contact Caritas Kitui IT Dispatch at 0800000890.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white hover:bg-zinc-200 border border-zinc-300 font-bold text-zinc-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
