using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace ApexBotDesktop
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            // 1. Kök dizini bul (program/ klasörünün bir üstü = botv3 ana dizini)
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string rootDir = Path.GetFullPath(Path.Combine(appDir, ".."));
            if (!File.Exists(Path.Combine(rootDir, "server.js")))
            {
                rootDir = appDir; // Eğer tüm dosyalar aynı klasördeyse
            }

            // 2. Node.js ve node_modules'un bulunduğu kök dizinde sunucuyu başlat
            EnsureNodeServerRunning(rootDir);

            // 3. Modern Desktop App Penceresini Başlat (Chromium App Mode)
            LaunchModernDesktopWindow();
        }

        private static string FindNodeExecutable(string rootDir)
        {
            // 1. Öncelik: botv3 klasörünün kendi içindeki node.exe (eğer taşındıysa)
            string localNode = Path.Combine(rootDir, "node.exe");
            if (File.Exists(localNode)) return localNode;

            // 2. Öncelik: Program Files / nodejs
            string pfNode = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"nodejs\node.exe");
            if (File.Exists(pfNode)) return pfNode;

            // 3. Öncelik: Program Files (x86) / nodejs
            string pfx86Node = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"nodejs\node.exe");
            if (File.Exists(pfx86Node)) return pfx86Node;

            // 4. Öncelik: AppData / Local / Programs / nodejs
            string userNode = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\nodejs\node.exe");
            if (File.Exists(userNode)) return userNode;

            // 5. Fallback: Sistem PATH'indeki genel "node"
            return "node.exe";
        }

        private static void EnsureNodeServerRunning(string rootDir)
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://localhost:3050/api/status");
                req.Timeout = 800;
                using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
                {
                    if (res.StatusCode == HttpStatusCode.OK) return; // Sunucu zaten ayakta
                }
            }
            catch { }

            try
            {
                string nodePath = FindNodeExecutable(rootDir);

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = nodePath,
                    Arguments = "server.js",
                    WorkingDirectory = rootDir, // <-- node_modules doğrudan bu klasörden okunur!
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                Process.Start(psi);
                Thread.Sleep(1200);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Node.js başlatılamadı: " + ex.Message + "\nLütfen Node.js'in kurulu olduğundan emin olun.", "APEX-BOT Hata", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static void LaunchModernDesktopWindow()
        {
            string url = "http://localhost:3050/program/index.html";
            string args = string.Format("--app=\"{0}\" --window-size=1080,720 --app-id=APEX_BOT_PRO", url);

            // 1. Öncelik: Windows 10/11'de yerleşik olan Microsoft Edge (Chromium)
            string edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe");
            if (!File.Exists(edgePath))
            {
                edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe");
            }

            // 2. Öncelik: Google Chrome
            string chromePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe");
            if (!File.Exists(chromePath))
            {
                chromePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe");
            }

            string browserPath = null;
            if (File.Exists(edgePath)) browserPath = edgePath;
            else if (File.Exists(chromePath)) browserPath = chromePath;

            if (browserPath != null)
            {
                try
                {
                    ProcessStartInfo appPsi = new ProcessStartInfo
                    {
                        FileName = browserPath,
                        Arguments = args,
                        UseShellExecute = false
                    };
                    Process.Start(appPsi);
                    return;
                }
                catch { }
            }

            // Fallback: Varsayılan tarayıcıda aç
            Process.Start(url);
        }
    }
}
