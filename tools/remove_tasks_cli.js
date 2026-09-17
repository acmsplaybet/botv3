/**
 * CLI Tool for deleting Windows Task Scheduler tasks
 */
const { removeWindowsTasks } = require('../core/scheduler_manager');

console.log('🗑️ Windows Görev Zamanlayıcısından BPA görevleri kaldırılıyor...');
try {
  const res = removeWindowsTasks(console.log);
  console.log('\n✅ Windows Görev Zamanlayıcısı görevleri temizlendi! (Silindi: ' + (res.deleted ? 'Evet' : 'Zaten yoktu') + ')');
} catch (err) {
  console.error('\n❌ Hata oluştu:', err.message);
  process.exit(1);
}
