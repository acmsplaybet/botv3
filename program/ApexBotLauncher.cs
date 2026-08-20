using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace ApexBotDesktop
{
    static class Program
    {
        private static Process serverProcess = null;

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            // 1. Çalışma Dizinini Belirle (botv3 kök dizini)
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string rootDir = Path.GetFullPath(Path.Combine(appDir, ".."));
            if (!File.Exists(Path.Combine(rootDir, "server.js")))
            {
                rootDir = appDir; // Eğer program kök dizindeyse
            }

            // 2. Arka Planda Node.js Sunucusunu Başlat
            StartNodeServer(rootDir);

            // 3. Ana Masaüstü Formunu Aç
            Application.Run(new MainWindow(rootDir));
        }

        private static void StartNodeServer(string rootDir)
        {
            try
            {
                // Sunucu zaten ayakta mı kontrol et
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create("http://localhost:3050/api/status");
                request.Timeout = 1000;
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    if (response.StatusCode == HttpStatusCode.OK) return; // Zaten çalışıyor
                }
            }
            catch { }

            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "node.exe",
                    Arguments = "server.js",
                    WorkingDirectory = rootDir,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                serverProcess = Process.Start(psi);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Node.js sunucusu başlatılamadı: " + ex.Message + "\nLütfen Node.js'in sistemde kurulu olduğundan emin olun.", "APEX-BOT Hata", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
    }

    public class MainWindow : Form
    {
        private WebBrowser browser;
        private NotifyIcon trayIcon;

        public MainWindow(string rootDir)
        {
            this.Text = "APEX-BOT — Master Forebet & APEX Ingestion Station";
            this.Size = new Size(1360, 840);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(9, 13, 22);
            this.Icon = SystemIcons.Application;

            // WebBrowser Kontrolü
            browser = new WebBrowser
            {
                Dock = DockStyle.Fill,
                ScriptErrorsSuppressed = true,
                IsWebBrowserContextMenuEnabled = false
            };
            this.Controls.Add(browser);

            // Tray Icon
            trayIcon = new NotifyIcon
            {
                Icon = SystemIcons.Application,
                Text = "APEX-BOT (Arka Planda Aktif)",
                Visible = true
            };

            ContextMenu contextMenu = new ContextMenu();
            contextMenu.MenuItems.Add("Göster", (s, e) => { this.Show(); this.WindowState = FormWindowState.Normal; });
            contextMenu.MenuItems.Add("Çıkış", (s, e) => { trayIcon.Visible = false; Application.Exit(); });
            trayIcon.ContextMenu = contextMenu;
            trayIcon.DoubleClick += (s, e) => { this.Show(); this.WindowState = FormWindowState.Normal; };

            this.Load += (s, e) =>
            {
                // Sunucu hazır olana kadar 1.5 saniye bekle ve sayfayı yükle
                Thread.Sleep(1500);
                browser.Navigate("http://localhost:3050/program/index.html");
            };

            this.FormClosing += (s, e) =>
            {
                // Çıkış yaparken tray'i temizle
                trayIcon.Visible = false;
            };
        }
    }
}
