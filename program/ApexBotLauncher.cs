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

            // 1. Çalışma Dizinini Belirle
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string rootDir = appDir; // Varsayılan: EXE'nin kendi klasörü (Örn: C:\APEX-BOT)

            // Eğer EXE'nin yanında server.js yoksa, bir üst klasöre bak
            if (!File.Exists(Path.Combine(rootDir, "server.js")))
            {
                string parentDir = Path.GetFullPath(Path.Combine(appDir, ".."));
                if (File.Exists(Path.Combine(parentDir, "server.js")))
                {
                    rootDir = parentDir;
                }
            }

            // 2. path_config.txt içinde kayıtlı özel bir yol var mı?
            string savedPath = GetSavedRootPath(appDir);
            if (!string.IsNullOrEmpty(savedPath) && Directory.Exists(savedPath) && File.Exists(Path.Combine(savedPath, "server.js")))
            {
                rootDir = savedPath;
            }

            // 3. node_modules ve server.js kontrolü
            if (!File.Exists(Path.Combine(rootDir, "server.js")))
            {
                rootDir = PromptUserForProjectDirectory(rootDir, appDir);
                if (string.IsNullOrEmpty(rootDir)) return;
            }

            // 4. Node.js Sunucusunu Belirlenen Dizinde Başlat
            EnsureNodeServerRunning(rootDir);

            // 5. Modern Masaüstü Penceresini Başlat
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

        private static string PromptUserForProjectDirectory(string currentRoot, string appDir)
        {
            MessageBox.Show(
                "APEX-BOT: 'server.js' veya 'node_modules' dosyaları otomatik bulunamadı.\n\n" +
                "Lütfen bot dosyalarınızın bulunduğu ana klasörü (APEX-BOT) seçin.",
                "APEX-BOT Konum Belirleme",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information
            );

            using (FolderBrowserDialog fbd = new FolderBrowserDialog())
            {
                fbd.Description = "Lütfen bot dosyalarının bulunduğu ana klasörü seçin:";
                fbd.ShowNewFolderButton = false;
                if (Directory.Exists(currentRoot)) fbd.SelectedPath = currentRoot;

                if (fbd.ShowDialog() == DialogResult.OK)
                {
                    string selected = fbd.SelectedPath;
                    SaveRootPath(appDir, selected);
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

        private static void EnsureNodeServerRunning(string rootDir)
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://localhost:3050/api/status");
                req.Timeout = 800;
                using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
                {
                    if (res.StatusCode == HttpStatusCode.OK) return;
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
                    WorkingDirectory = rootDir,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                Process.Start(psi);
                Thread.Sleep(1200);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Node.js başlatılamadı: " + ex.Message, "APEX-BOT Hata", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static void LaunchModernDesktopWindow()
        {
            string url = "http://localhost:3050/program/index.html";
            string args = string.Format("--app=\"{0}\" --window-size=1080,720 --app-id=APEX_BOT_PRO", url);

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
