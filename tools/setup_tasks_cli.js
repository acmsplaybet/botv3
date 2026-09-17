/**
 * CLI Tool for Windows Task Scheduler setup
 */
const { syncWindowsTasks } = require('../core/scheduler_manager');

console.log('🔄 Windows Görev Zamanlayıcısı senkronize ediliyor...');
try {
  const res = syncWindowsTasks();
  console.log('\n📋 Görev Senkronizasyon Durumu:');
  console.log(`  - [BPA_Bot_Morning] Saat: ${res.morning.time} (Güncellendi: ${res.morning.updated ? 'Evet' : 'Hayır'})`);
  console.log(`  - [BPA_Bot_Evening] Saat: ${res.evening.time} (Güncellendi: ${res.evening.updated ? 'Evet' : 'Hayır'})`);
  console.log('\n✅ Windows Görev Zamanlayıcısı başarıyla ayarlandı!');
} catch (err) {
  console.error('\n❌ Hata oluştu:', err.message);
  process.exit(1);
}
