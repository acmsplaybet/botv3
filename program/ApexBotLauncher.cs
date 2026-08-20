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
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            // 1. Çalışma Dizinini Belirle (EXE'nin kendi klasörü)
            string rootDir = AppDomain.CurrentDomain.BaseDirectory;

            // 2. Özel bir yol path_config.txt içinde kayıtlıysa oku
            string savedPath = GetSavedRootPath(rootDir);
            if (!string.IsNullOrEmpty(savedPath) && Directory.Exists(savedPath) && File.Exists(Path.Combine(savedPath, "server.js")))
            {
                rootDir = savedPath;
            }

            // 3. node_modules ve server.js kontrolü
            if (!File.Exists(Path.Combine(rootDir, "server.js")))
            {
                rootDir = PromptUserForProjectDirectory(rootDir);
                if (string.IsNullOrEmpty(rootDir)) return;
            }

            // 4. Node.js Sunucusunu Kesin Olarak Başlat (Port 3050 hazır olana kadar bekle)
            bool serverReady = EnsureNodeServerRunning(rootDir);
            if (!serverReady)
            {
                MessageBox.Show(
                    "APEX-BOT Sunucusu (server.js) başlatılamadı!\n\n" +
                    "Lütfen karşı bilgisayarda Node.js'in kurulu olduğundan ve 'node_modules' klasörünün mevcut olduğundan emin olun.\n" +
                    "Detaylar için 'server_boot.log' dosyasını inceleyebilirsiniz.",
                    "APEX-BOT Başlatma Hatası",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return;
            }

            // 5. Modern Masaüstü Chromium Penceresini Aç (Yatay Geniş, Ortalı Pencere Modu)
            LaunchModernDesktopWindow();
        }

        private static string GetSavedRootPath(string appDir)
        {
            try
            {
                string cfgPath = Path.Combine(appDir, "path_config.txt");
                if (File.Exists(cfgPath))
                {
                    string path = File.ReadAllText(cfgPath).Trim();
                    if (Directory.Exists(path)) return path;
                }
            }
            catch { }
            return null;
        }

        private static void SaveRootPath(string appDir, string rootDir)
        {
            try
            {
                string cfgPath = Path.Combine(appDir, "path_config.txt");
                File.WriteAllText(cfgPath, rootDir);
            }
            catch { }
        }

        private static string PromptUserForProjectDirectory(string currentRoot)
        {
            MessageBox.Show(
                "APEX-BOT: 'server.js' veya 'node_modules' dosyaları otomatik bulunamadı.\n\n" +
                "Lütfen bot dosyalarınızın bulunduğu ana klasörü seçin.",
                "APEX-BOT Konum Belirleme",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information
            );

            using (FolderBrowserDialog fbd = new FolderBrowserDialog())
            {
                fbd.Description = "Lütfen APEX-BOT ana klasörünü seçin:";
                fbd.ShowNewFolderButton = false;
                if (Directory.Exists(currentRoot)) fbd.SelectedPath = currentRoot;

                if (fbd.ShowDialog() == DialogResult.OK)
                {
                    string selected = fbd.SelectedPath;
                    SaveRootPath(currentRoot, selected);
                    return selected;
                }
            }
            return null;
        }

        private static string FindNodeExecutable(string rootDir)
        {
            string localNode = Path.Combine(rootDir, "node.exe");
            if (File.Exists(localNode)) return localNode;

            string pfNode = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"nodejs\node.exe");
            if (File.Exists(pfNode)) return pfNode;

            string pfx86Node = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"nodejs\node.exe");
            if (File.Exists(pfx86Node)) return pfx86Node;

            string userNode = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\nodejs\node.exe");
            if (File.Exists(userNode)) return userNode;

            return "node.exe";
        }

        private static bool EnsureNodeServerRunning(string rootDir)
        {
            // Önce sunucu zaten ayakta mı diye bak
            if (IsServerAlive()) return true;

            try
            {
                string nodePath = FindNodeExecutable(rootDir);

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = nodePath,
                    Arguments = "server.js",
                    WorkingDirectory = rootDir,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    RedirectStandardOutput = false,
                    RedirectStandardError = false
                };
                Process.Start(psi);

                // Port 3050 dinlenmeye başlayana kadar 15 saniye boyunca her 400ms'de bir kontrol et
                for (int i = 0; i < 35; i++)
                {
                    Thread.Sleep(400);
                    if (IsServerAlive())
                    {
                        return true;
                    }
                }
            }
            catch (Exception ex)
            {
                File.WriteAllText(Path.Combine(rootDir, "server_boot.log"), "Boot Exception: " + ex.ToString());
            }

            return IsServerAlive();
        }

        private static bool IsServerAlive()
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://localhost:3050/api/status");
                req.Timeout = 600;
                using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
                {
                    return res.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        private static void LaunchModernDesktopWindow()
        {
            string url = "http://localhost:3050/";
            // Standart ortalanmış ferah yatay pencere modu (1240 x 780)
            string args = string.Format("--app=\"{0}\" --window-size=1240,780 --app-id=APEX_BOT_PRO", url);

            string edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe");
            if (!File.Exists(edgePath))
            {
                edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe");
            }

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

            Process.Start(url);
        }
    }
}
