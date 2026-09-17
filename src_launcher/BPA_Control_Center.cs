using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace BPAControlCenter
{
    static class Program
    {
        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        private const int SW_RESTORE = 9;
        private const int SW_SHOW = 5;

        private static NotifyIcon trayIcon;
        private static ContextMenu trayMenu;
        private static Process nodeProcess;
        private static string appUrl = "http://localhost:3000";
        private static string baseDir;
        private static TrayAppContext appContext;
        private static volatile bool isShuttingDown = false;
        private static System.Windows.Forms.Timer watchdogTimer;

        private static void Log(string msg)
        {
            try
            {
                string logFile = Path.Combine(baseDir ?? AppDomain.CurrentDomain.BaseDirectory, "launcher.log");
                File.AppendAllText(logFile, string.Format("[{0}] {1}\r\n", DateTime.Now.ToString("HH:mm:ss.fff"), msg));
            }
            catch { }
        }

        public class TrayAppContext : ApplicationContext
        {
            public TrayAppContext()
            {
                SetupTray();
            }
        }

        [STAThread]
        static void Main()
        {
            baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
            Log("=== BPA_Control_Center Başlatıldı ===");

            try
            {
                bool createdNew;
                using (Mutex mutex = new Mutex(true, @"Global\BPA_V4_MASTER_CONTROL_CENTER_MUTEX", out createdNew))
                {
                    Log("Mutex createdNew: " + createdNew);
                    if (!createdNew)
                    {
                        Log("Zaten açık bir süreç var. Backend durumu kontrol ediliyor...");
                        if (IsBackendReady())
                        {
                            Log("Backend aktif (HTTP 200). Mevcut pencere ön plana getiriliyor...");
                            if (!BringExistingWindowToFront())
                            {
                                OpenAppWindow();
                            }
                            return;
                        }

                        Log("DİKKAT: Önceki süreç var fakat backend (port 3000) yanıt vermiyor! Eski süreçler temizleniyor...");
                        try
                        {
                            int currentPid = Process.GetCurrentProcess().Id;
                            foreach (var p in Process.GetProcessesByName("BPA_Control_Center"))
                            {
                                if (p.Id != currentPid)
                                {
                                    try { p.Kill(); } catch { }
                                }
                            }
                        }
                        catch { }

                        KillPort3000();
                        Thread.Sleep(500);
                        Log("Eski süreçler temizlendi, bu süreç ana denetim merkezi olarak başlatılıyor.");
                    }

                    Application.EnableVisualStyles();
                    Application.SetCompatibleTextRenderingDefault(false);

                    // 1. Port 3000 ve Node Kontrolü
                    Log("Backend kontrol ediliyor...");
                    if (!IsBackendReady())
                    {
                        Log("Backend aktif değil. Port 3000 temizlenip Node başlatılıyor...");
                        KillPort3000();
                        StartNodeBackend();
                        WaitForBackend();
                        Log("Backend hazırlandı mı: " + IsBackendReady());
                    }
                    else
                    {
                        Log("Backend zaten aktif (HTTP 200).");
                    }

                    // 2. Watchdog Bekçisi (Node çökerse 5 saniye içinde otomatik ayağa kaldırır)
                    SetupWatchdog();

                    // 3. Uygulama Context ve Sistem Tepsisi
                    appContext = new TrayAppContext();

                    // 4. Uygulama penceresini aç
                    Log("Uygulama penceresi açılıyor...");
                    OpenAppWindow();

                    // 5. Çıkış Olayları
                    AppDomain.CurrentDomain.ProcessExit += (s, e) => CleanExit();
                    Application.ApplicationExit += (s, e) => CleanExit();

                    Log("Application.Run(appContext) başlatılıyor...");
                    Application.Run(appContext);
                    Log("Application.Run tamamlandı.");
                }
            }
            catch (Exception ex)
            {
                Log("KRİTİK HATA (Main): " + ex.ToString());
            }
        }

        public static bool IsBackendReady()
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(appUrl + "/api/status");
                request.Timeout = 800;
                request.Method = "GET";
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    return response.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        private static void KillPort3000()
        {
            if (IsBackendReady()) return;

            try
            {
                using (var client = new TcpClient())
                {
                    var result = client.BeginConnect("127.0.0.1", 3000, null, null);
                    bool success = result.AsyncWaitHandle.WaitOne(80);
                    if (!success) return;
                    client.EndConnect(result);
                }

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c for /f \"tokens=5\" %a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /f /pid %a >nul 2>&1",
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                using (Process p = Process.Start(psi))
                {
                    p.WaitForExit(2000);
                }
            }
            catch (Exception ex)
            {
                Log("KillPort3000 hatası: " + ex.Message);
            }
        }

        private static void StartNodeBackend()
        {
            string agentScript = Path.Combine(baseDir, "bpa_desktop_agent.js");
            if (!File.Exists(agentScript))
            {
                string fallback = @"C:\xampp\htdocs\botv4\bpa_desktop_agent.js";
                if (File.Exists(fallback))
                {
                    agentScript = fallback;
                    baseDir = @"C:\xampp\htdocs\botv4";
                }
                else
                {
                    Log("Hata: bpa_desktop_agent.js bulunamadı: " + agentScript);
                    MessageBox.Show("Hata: bpa_desktop_agent.js dosyası bulunamadı!\n" + agentScript, "BPA V4 Başlatma Hatası", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    Environment.Exit(1);
                }
            }

            string nodePath = @"C:\Program Files\nodejs\node.exe";
            if (!File.Exists(nodePath)) nodePath = "node.exe";

            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = nodePath,
                    Arguments = "\"" + agentScript + "\"",
                    WorkingDirectory = baseDir,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };

                nodeProcess = Process.Start(psi);
                Log("Node süreci başlatıldı. PID: " + (nodeProcess != null ? nodeProcess.Id.ToString() : "null"));
            }
            catch (Exception ex)
            {
                Log("StartNodeBackend hatası: " + ex.ToString());
                MessageBox.Show("Node.js başlatılamadı. Bilgisayarda Node.js kurulu olduğundan emin olun.\n\nAyrıntı: " + ex.Message, "BPA V4 Motor Hatası", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Environment.Exit(1);
            }
        }

        private static void WaitForBackend()
        {
            int attempts = 0;
            while (attempts < 100)
            {
                if (IsBackendReady())
                {
                    Log(string.Format("Backend {0}. denemede yanıt verdi ({1}ms).", attempts + 1, (attempts + 1) * 100));
                    return;
                }
                Thread.Sleep(100);
                attempts++;
            }
            Log("WaitForBackend zaman aşımı! 10 saniye boyunca yanıt alınamadı.");
        }

        private static void SetupWatchdog()
        {
            try
            {
                watchdogTimer = new System.Windows.Forms.Timer();
                watchdogTimer.Interval = 5000; // Her 5 saniyede bir kontrol et
                watchdogTimer.Tick += (s, e) =>
                {
                    if (isShuttingDown) return;
                    if (!IsBackendReady())
                    {
                        Log("Watchdog Uyarısı: Arka plan Node.js servisi yanıt vermiyor! Otomatik yeniden başlatılıyor...");
                        KillPort3000();
                        StartNodeBackend();
                    }
                };
                watchdogTimer.Start();
                Log("Watchdog (Sağlık Bekçisi) aktif edildi (5 sn periyot).");
            }
            catch (Exception ex)
            {
                Log("SetupWatchdog hatası: " + ex.Message);
            }
        }

        private static void SetupTray()
        {
            trayMenu = new ContextMenu();
            trayMenu.MenuItems.Add("🚀 BPA Master Panelini Aç", (s, e) => OpenAppWindow());
            trayMenu.MenuItems.Add("-");
            trayMenu.MenuItems.Add("⏰ Otomatik Zamanlayıcıyı Değiştir (Aç/Kapat)", (s, e) => ToggleAutomationViaHttp());
            trayMenu.MenuItems.Add("⚡ Görev Yöneticisi & Acil Fren", (s, e) => OpenAppTab("view-task-manager"));
            trayMenu.MenuItems.Add("🩺 Sistem Sağlık Radarı", (s, e) => OpenAppTab("view-system-health"));
            trayMenu.MenuItems.Add("📟 Canlı Log Konsolu", (s, e) => OpenAppTab("view-live-console"));
            trayMenu.MenuItems.Add("-");
            trayMenu.MenuItems.Add("🛑 Acil Fren (Tüm Botu Durdur)", (s, e) => EmergencyKillAll());
            trayMenu.MenuItems.Add("-");
            trayMenu.MenuItems.Add("❌ Çıkış Yap (Tüm Sistemi Kapat)", (s, e) => ConfirmAndExit());

            trayIcon = new NotifyIcon
            {
                Text = "BPA V4 — Master Forebet Veri İstasyonu",
                Icon = SystemIcons.Application,
                ContextMenu = trayMenu,
                Visible = true
            };

            trayIcon.DoubleClick += (s, e) => {
                if (!BringExistingWindowToFront())
                {
                    OpenAppWindow();
                }
            };

            trayIcon.ShowBalloonTip(2000, "BPA V4 Control Center", "BPA Bot arka planda aktif. Panel hazır.", ToolTipIcon.Info);
        }

        public static void ConfirmAndExit()
        {
            DialogResult dr = MessageBox.Show(
                "BPA Kontrol Merkezini ve çalışan tüm arka plan bot süreçlerini tamamen kapatmak istediğinize emin misiniz?",
                "BPA V4 - Güvenli Kapatma Onayı",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question
            );

            if (dr == DialogResult.Yes)
            {
                CleanExit();
                if (appContext != null)
                {
                    appContext.ExitThread();
                }
                else
                {
                    Application.Exit();
                }
            }
        }

        public static bool BringExistingWindowToFront()
        {
            try
            {
                IntPtr targetHwnd = IntPtr.Zero;

                EnumWindows((hWnd, lParam) =>
                {
                    if (IsWindowVisible(hWnd))
                    {
                        StringBuilder sb = new StringBuilder(256);
                        GetWindowText(hWnd, sb, 256);
                        string title = sb.ToString();

                        if (title.IndexOf("APEX-BOT V4", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            title.IndexOf("Forebet Veri İstasyonu", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            targetHwnd = hWnd;
                            return false; // Bulduk, aramayı durdur
                        }
                    }
                    return true;
                }, IntPtr.Zero);

                if (targetHwnd != IntPtr.Zero)
                {
                    Log("Mevcut pencere bulundu: " + targetHwnd.ToString() + ", ön plana alınıyor...");
                    ShowWindow(targetHwnd, SW_RESTORE);
                    SetForegroundWindow(targetHwnd);
                    return true;
                }
            }
            catch (Exception ex)
            {
                Log("BringExistingWindowToFront hatası: " + ex.Message);
            }
            return false;
        }

        public static void OpenAppWindow()
        {
            OpenAppTab("");
        }

        public static void OpenAppTab(string tabId)
        {
            if (!IsBackendReady())
            {
                Log("OpenAppTab öncesi backend aktif değil. Başlatılıyor...");
                KillPort3000();
                StartNodeBackend();
                WaitForBackend();
            }

            string url = appUrl + (string.IsNullOrEmpty(tabId) ? "" : "#" + tabId);
            Log("OpenAppTab çağrıldı. Hedef URL: " + url);

            // 1. Öncelik: Google Chrome App Mode (Kullanıcının aktif tarayıcısı)
            string chromePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe");
            if (!File.Exists(chromePath))
            {
                chromePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe");
            }

            if (File.Exists(chromePath))
            {
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = chromePath,
                        Arguments = string.Format("--new-window --app=\"{0}\" --window-size=1440,900", url),
                        UseShellExecute = true
                    };
                    Process.Start(psi);
                    Log("Chrome App Mode başarıyla başlatıldı.");
                    Thread.Sleep(300);
                    BringExistingWindowToFront();
                    return;
                }
                catch (Exception ex)
                {
                    Log("Chrome başlatma hatası: " + ex.Message);
                }
            }

            // 2. Öncelik: Microsoft Edge App Mode
            string edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe");
            if (!File.Exists(edgePath))
            {
                edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe");
            }

            if (File.Exists(edgePath))
            {
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = edgePath,
                        Arguments = string.Format("--new-window --app=\"{0}\" --window-size=1440,900", url),
                        UseShellExecute = true
                    };
                    Process.Start(psi);
                    Log("Edge App Mode başarıyla başlatıldı.");
                    Thread.Sleep(300);
                    BringExistingWindowToFront();
                    return;
                }
                catch (Exception ex)
                {
                    Log("Edge başlatma hatası: " + ex.Message);
                }
            }

            // 3. Fallback: Varsayılan Sistem Tarayıcısı
            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
                Log("Varsayılan tarayıcıda URL açıldı.");
            }
            catch (Exception ex)
            {
                Log("Varsayılan tarayıcı açma hatası: " + ex.Message);
            }
        }

        private static void ToggleAutomationViaHttp()
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(appUrl + "/api/toggle_automation");
                req.Timeout = 1500;
                req.Method = "GET";
                using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
                {
                    using (StreamReader r = new StreamReader(res.GetResponseStream()))
                    {
                        string json = r.ReadToEnd();
                        bool active = json.Contains("\"automation_active\":true");
                        if (trayIcon != null)
                        {
                            trayIcon.ShowBalloonTip(2000, "BPA V4 Zamanlayıcı", active ? "Otomatik günlük zamanlayıcılar AKTİF edildi." : "Otomatik günlük zamanlayıcılar DURDURULDU.", ToolTipIcon.Info);
                        }
                    }
                }
            }
            catch { }
        }

        private static void EmergencyKillAll()
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(appUrl + "/api/tasks/kill-all");
                request.Timeout = 3000;
                request.Method = "POST";
                request.ContentLength = 0;
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse()) { }

                if (trayIcon != null)
                {
                    trayIcon.ShowBalloonTip(3000, "BPA V4 Acil Fren", "Tüm kazıma ve tarayıcı süreçleri durduruldu.", ToolTipIcon.Warning);
                }
            }
            catch
            {
                KillPort3000();
            }
        }

        private static void CleanExit()
        {
            try
            {
                isShuttingDown = true;
                if (watchdogTimer != null)
                {
                    try { watchdogTimer.Stop(); watchdogTimer.Dispose(); } catch { }
                }
                Log("CleanExit çağrıldı.");
                if (trayIcon != null)
                {
                    trayIcon.Visible = false;
                    trayIcon.Dispose();
                }

                try
                {
                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create(appUrl + "/api/shutdown");
                    request.Timeout = 1000;
                    request.Method = "GET";
                    using (HttpWebResponse response = (HttpWebResponse)request.GetResponse()) { }
                }
                catch { }

                if (nodeProcess != null && !nodeProcess.HasExited)
                {
                    try { nodeProcess.Kill(); } catch { }
                }

                KillPort3000();
            }
            catch (Exception ex)
            {
                Log("CleanExit hatası: " + ex.Message);
            }
        }
    }
}
