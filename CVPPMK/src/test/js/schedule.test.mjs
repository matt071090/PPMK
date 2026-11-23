import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// Path utama sama saat disalin ke src/test/js; fallback hanya untuk paket out/.
async function packagedRead(installed, packaged) {
  try { return await readFile(new URL(installed, import.meta.url), 'utf8'); }
  catch (e) { if(e.code !== 'ENOENT') throw e; return readFile(new URL(packaged, import.meta.url), 'utf8'); }
}
const source = await packagedRead('../../main/resources/static/js/pages/schedule.js', '../static/js/pages/schedule.js');
const { mergeUsers, withSubmitRange, rollupStatus, withTrainingRollup, balanceTimeline, withFixedPic, isStemItem, activeUsers, picLabel, picOptions, cardNote, isValidDate, todayLocal, countdown, effectiveStatus, validRange, needsAttention, timelineMilestones, areaStatus, savedAt, progress, groupProgress, nextMilestone, todayMarker, draftChanges, timelinePosition, compactTimelineDate } = await import('../../main/resources/static/js/pages/schedule.js');
const seed = JSON.parse(await packagedRead('../../main/resources/schedule/default.json', '../resources/schedule/default.json'));
test('format ketat dan tanggal kalender nyata', () => {
  for (const s of ['2026-12-01','2027-01-01','2024-02-29','2000-02-29','0001-01-01']) assert.equal(isValidDate(s),true,s);
  for (const s of ['2026-02-29','1900-02-29','2026-04-31','2026-13-01','2026-00-01','2026-01-00','0000-01-01','26-01-01','2026-1-01','2026-01-1','2026-01-01T00:00:00Z',' 2026-01-01','2026-01-01\n',null,123]) assert.equal(isValidDate(s),false,String(s));
});
test('hitung mundur melewati tahun dan tepat hari H', () => {
  assert.equal(countdown('2027-01-01','2026-11-17'),45);
  assert.equal(countdown('2027-01-01','2026-12-31'),1);
  assert.equal(countdown('2027-01-01','2027-01-01'),0);
  assert.equal(countdown('2027-01-01','2027-01-02'),-1);
  assert.equal(countdown('2024-03-01','2024-02-28'),2);
  assert.equal(countdown('0001-01-02','0001-01-01'),1);
});
test('beda tanggal stabil melintasi DST', () => {
  assert.equal(countdown('2026-03-09','2026-03-08'),1);
  assert.equal(countdown('2026-11-02','2026-11-01'),1);
});
test('tanggal lokal perangkat tanpa konversi UTC', () => {
  assert.equal(todayLocal(new Date(2026,11,31,23,59)), '2026-12-31');
  assert.equal(todayLocal(new Date(2027,0,1,0,1)), '2027-01-01');
});
test('telat hanya sesudah akhir kegiatan dan belum selesai', () => {
  for (const s of ['belum','proses']) {
    assert.equal(effectiveStatus(s,'2026-12-30','2026-12-31'),'telat');
    assert.equal(effectiveStatus(s,'2026-12-31','2026-12-31'),s);
    assert.equal(effectiveStatus(s,'2027-01-01','2026-12-31'),s);
  }
  assert.equal(effectiveStatus('selesai','2026-12-30','2026-12-31'),'selesai');
});
test('kegiatan rentang tidak telat pada hari terakhir', () => {
  assert.equal(effectiveStatus('proses','2026-12-30','2026-12-29'),'proses');
  assert.equal(effectiveStatus('proses','2026-12-30','2026-12-31'),'telat');
});
test('input hitungan tidak valid ditolak', () => {
  assert.throws(()=>countdown('2026-02-30','2026-01-01'),RangeError);
  assert.throws(()=>countdown('2026-01-01','2026-02-30'),RangeError);
  assert.throws(()=>effectiveStatus('telat','2026-01-01','2026-01-02'),RangeError);
  assert.throws(()=>effectiveStatus(null,'2026-01-01'),RangeError);
});
test('validasi rentang termasuk pergantian tahun', () => {
  assert.equal(validRange('2026-12-31','2027-01-07'),true);
  assert.equal(validRange('2026-12-31','2026-12-31'),true);
  assert.equal(validRange('2027-01-07','2026-12-31'),false);
  assert.equal(validRange('2026-02-30','2026-12-31'),false);
});
test('seed: semua tanggal, status, ID dan urutan balance valid', () => {
  assert.equal(isValidDate(seed.project.goLiveDate),true);
  assert.equal(new Set(seed.items.map(it=>it.id)).size,seed.items.length);
  assert.equal(seed.items.length,37);
  for (const it of seed.items) {
    assert.equal(validRange(it.startDate,it.endDate),true,it.id);
    assert.equal(it.status,'belum');
    if(it.section==='balance') {
      assert.equal(validRange(it.cutoffDate,it.handoverDate),true);
      assert.equal(validRange(it.handoverDate,it.uploadDate),true);
      assert.equal(it.endDate,it.uploadDate);
    }
  }
});
test('seed: tanggal penting dan rincian user tetap tersedia', () => {
  const get=id=>seed.items.find(it=>it.id===id);
  assert.equal(seed.items.filter(it=>it.section==='master').length,16);
  assert.equal(seed.items.filter(it=>it.section==='training').length,1);
  assert.equal(get('golive').endDate,'2027-01-01');
  assert.match(get('golive').note,/sudah diupload/);
  assert.equal(get('balance-ap').uploadDate,'2027-01-07');
  assert.equal(get('balance-ar').handoverDate,'2027-01-05');
  assert.equal(get('balance-inv').uploadTime,'19:00-20:00');
  assert.equal(get('final').endDate,'2027-01-15');
  assert.match(get('verify').note,/09:00-12:00/);
});

test('perlu dicek: telat, hari ini, +3 masuk; selesai dan +4 tidak', () => {
  const items = [
    {id:'future',endDate:'2026-12-24',status:'belum'},
    {id:'edge',endDate:'2026-12-23',status:'proses'},
    {id:'done',endDate:'2026-12-01',status:'selesai'},
    {id:'today',endDate:'2026-12-20',status:'belum'},
    {id:'late',endDate:'2026-12-19',status:'belum'}
  ];
  assert.deepEqual(needsAttention(items,'2026-12-20').map(it=>it.id),['late','today','edge']);
  assert.equal(items[0].id,'future');
  assert.deepEqual(needsAttention([], '2026-12-20'),[]);
  assert.deepEqual(needsAttention(items.slice(0,1),'2026-12-20'),[]);
});
test('garis waktu: 11 milestone terurut (A/P-A/R, FA, G/L punya titik sendiri), memakai data aktual tanpa mutasi', () => {
  const reverse = [...seed.items].reverse();
  const timeline = timelineMilestones(reverse);
  assert.deepEqual(timeline.map(it=>it.id),['kickoff','training','upload-master','verify','opname','inventory','golive','ap-ar','fa','gl','final']);
  assert.deepEqual(timeline.slice(7,10).map(it=>it.startDate),['2027-01-07','2027-01-12','2027-01-14']);
  assert.equal(timeline[4].startDate,'2026-12-29');
  assert.equal(timeline[4].endDate,'2026-12-31');
  assert.equal(timeline[5].endDate,'2026-12-31');
  assert.equal(timeline[0],seed.items.find(it=>it.id==='kickoff'));
  assert.deepEqual(timelineMilestones([]),[]);
  assert.deepEqual(timelineMilestones([{id:'final',endDate:'2027-01-16'}]).map(it=>it.endDate),['2027-01-16']);
});
test('status area tidak menyembunyikan bagian yang telat atau belum selesai', () => {
  const item = status=>({status,endDate:'2026-12-20'});
  assert.equal(areaStatus([item('selesai'),item('belum')],'2026-12-21'),'telat');
  assert.equal(areaStatus([item('selesai'),item('belum')],'2026-12-20'),'proses');
  assert.equal(areaStatus([item('selesai')],'2026-12-21'),'selesai');
  assert.equal(areaStatus([item('belum')],'2026-12-20'),'belum');
});
test('waktu simpan ramah menggunakan jam lokal perangkat', () => {
  assert.equal(savedAt(new Date(2026,10,17,9,57).toISOString()),'17 Nov 2026 09:57');
  assert.equal(savedAt('invalid'),'Belum tersedia');
});


test('progres keseluruhan: 37 kegiatan, selesai saja, kosong aman', () => {
  const items=structuredClone(seed.items); items[0].status='selesai'; items[1].status='proses';
  assert.deepEqual(progress(items),{done:1,total:37,percent:3});
  assert.deepEqual(progress([]),{done:0,total:0,percent:0});
  assert.equal(progress(items.map(it=>({...it,status:'selesai'}))).percent,100);
  assert.equal(seed.items[0].status,'belum');
});
test('progres tahap A–E dan rentang mengikuti perubahan jadwal', () => {
  const items=structuredClone(seed.items); items.find(it=>it.id==='master-A0').status='selesai';
  items.find(it=>it.id==='master-A0').endDate='2026-12-05';
  const groups=groupProgress(items);
  assert.deepEqual(groups.map(g=>g.total),[5,4,4,2,1]);
  assert.deepEqual([groups[0].done,groups[0].percent,groups[0].startDate,groups[0].endDate],[1,20,'2026-12-01','2026-12-05']);
  assert.equal(groupProgress([]).every(g=>g.total===0),true);
});
test('milestone berikutnya: urut tanggal, abaikan selesai/checklist/masa lalu', () => {
  assert.equal(nextMilestone([...seed.items].reverse(),'2026-12-17').id,'deadline');
  const items=structuredClone(seed.items); items.find(it=>it.id==='deadline').status='selesai';
  assert.equal(nextMilestone(items,'2026-12-18').id,'upload-master');
  assert.equal(nextMilestone(seed.items,'2027-01-16'),null);
  assert.equal(nextMilestone([],'2026-12-01'),null);
});
test('hari ini: hanya dalam rentang, kedua batas termasuk dan satu hari aman', () => {
  const items=[{startDate:'2026-12-01',endDate:'2026-12-11'}];
  assert.deepEqual(todayMarker(items,'2026-12-06'),{date:'2026-12-06',percent:50});
  assert.equal(todayMarker(items,'2026-12-01').percent,0);
  assert.equal(todayMarker(items,'2026-12-11').percent,100);
  assert.equal(todayMarker(items,'2026-11-30'),null);
  assert.equal(todayMarker(items,'2026-12-12'),null);
  assert.equal(todayMarker([]),null);
  assert.equal(todayMarker([{startDate:'2026-12-01',endDate:'2026-12-01'}],'2026-12-01').percent,0);
});
test('daftar draf: satu entri per kegiatan, lintas field, kembali ke awal bersih', () => {
  const items=structuredClone(seed.items);
  assert.deepEqual(draftChanges(seed.items,items),[]);
  items[0].status='proses'; items[0].pic='Tim'; items[1].note='Catatan baru';
  assert.deepEqual(draftChanges(seed.items,items).map(it=>[it.id,it.fields]),[['kickoff',['status','pic']],['prepare',['note']]]);
  items[0]=structuredClone(seed.items[0]);
  assert.equal(draftChanges(seed.items,items).length,1);
  items[1]=structuredClone(seed.items[1]);
  assert.deepEqual(draftChanges(seed.items,items),[]);
});


test('tanggal timeline: tunggal, rentang bulan sama, lintas bulan/tahun', () => {
  assert.deepEqual(compactTimelineDate('2026-12-01'),{label:'1 Des',year:'2026'});
  assert.deepEqual(compactTimelineDate('2026-12-15','2026-12-16'),{label:'15–16 Des',year:'2026'});
  assert.deepEqual(compactTimelineDate('2026-11-30','2026-12-02'),{label:'30 Nov–2 Des',year:'2026'});
  assert.deepEqual(compactTimelineDate('2026-12-31','2027-01-01'),{label:'31 Des–1 Jan',year:'2026–2027'});
  assert.throws(()=>compactTimelineDate('2026-12-02','2026-12-01'),RangeError);
  assert.throws(()=>compactTimelineDate('2026-02-29'),RangeError);
});
test('hari ini visual: interpolasi slot rata pada tanggal tidak berjarak rata', () => {
  const rows=[{startDate:'2026-12-01',endDate:'2026-12-01'},
    {startDate:'2026-12-11',endDate:'2026-12-11'},
    {startDate:'2026-12-31',endDate:'2027-01-02'}];
  const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} ≈ ${expected}`);
  near(timelinePosition(rows,'2026-12-01'),100/6);
  near(timelinePosition(rows,'2026-12-06'),100/3);
  assert.equal(timelinePosition(rows,'2026-12-11'),50);
  near(timelinePosition(rows,'2026-12-21'),200/3);
  near(timelinePosition(rows,'2027-01-02'),250/3);
  assert.equal(timelinePosition(rows,'2026-11-30'),null);
  assert.equal(timelinePosition(rows,'2027-01-03'),null);
});
test('hari ini visual: kosong, satu rentang, tanggal mulai sama', () => {
  assert.equal(timelinePosition([],'2026-12-01'),null);
  assert.equal(timelinePosition([{startDate:'2026-12-01',endDate:'2026-12-03'}],'2026-12-02'),50);
  const rows=[{startDate:'2026-12-01',endDate:'2026-12-01'},{startDate:'2026-12-01',endDate:'2026-12-03'}];
  assert.equal(timelinePosition(rows,'2026-12-01'),75);
});

test('cardNote: membuang kalimat bertanggal/berjam, menyisakan deskripsi', () => {
  assert.equal(cardNote('Sabtu, 10:00-12:00.'), '');
  assert.equal(cardNote('Senin, 09:00-12:00. Tidak ada upload susulan STEM.'), 'Tidak ada upload susulan STEM.');
  assert.equal(cardNote('Serah 19:00; upload 19:00-20:00; dicek Tim CV PPMK. Transaksi 31 Des diakui sebagai transaksi Januari 2027.'), 'Dicek Tim CV PPMK.');
  assert.equal(cardNote('Inventory sudah diupload. Saldo A/P, A/R, Fixed Asset, dan G/L menyusul.'), 'Inventory sudah diupload. Saldo A/P, A/R, Fixed Asset, dan G/L menyusul.');
  assert.equal(cardNote(''), ''); assert.equal(cardNote(null), '');
});

test('PIC: user aktif, label, dan opsi (STEM, PPMK per user, nilai lama dipertahankan)', () => {
  const users = activeUsers([['FIN-KSR1', 'Kasir Satu', 'N', 'N'], ['LOCKED1', 'Terkunci', 'N', 'Y'], ['B1i', null, 'Y', 'N'], null, [null, 'x']]);
  assert.deepEqual(users, [{ code: 'FIN-KSR1', name: 'Kasir Satu' }]);
  assert.equal(picLabel('', users), ''); assert.equal(picLabel('STEM', users), 'STEM');
  assert.equal(picLabel('PPMK:FIN-KSR1', users), 'PPMK · FIN-KSR1 (Kasir Satu)');
  assert.equal(picLabel('PPMK:HILANG', users), 'PPMK · HILANG');
  assert.equal(picLabel('Budi', users), 'Budi');
  const opts = picOptions(users, 'Budi');
  assert.deepEqual(opts.map(o => o.value), ['', 'STEM', 'PPMK:FIN-KSR1', 'Budi']);
  assert.equal(opts[2].label, 'FIN-KSR1 (Kasir Satu)'); assert.equal(picOptions([{ code: 'AP-STF1', name: 'AP-STF1' }])[2].label, 'AP-STF1');
  assert.deepEqual(picOptions([], 'STEM').map(o => o.value), ['', 'STEM']);
});

test('PIC tetap STEM: pekerjaan konsultan otomatis STEM dan tidak mengubah data asli', () => {
  const items = [{ id: 'training', pic: '' }, { id: 'upload-master', pic: 'PPMK:X' }, { id: 'opname', pic: '' }, { id: 'gl', pic: 'Budi' }];
  const out = withFixedPic(items);
  assert.deepEqual(out.map(it => it.pic), ['STEM', 'STEM', '', 'STEM']);
  assert.deepEqual(out.map(it => !!it.picFixed), [true, true, false, true]);
  assert.equal(items[1].pic, 'PPMK:X');
  assert.equal(out[2], items[2]);
  assert.ok(isStemItem('ap-ar') && isStemItem('fa') && !isStemItem('kickoff'));
  for (const id of ['training', 'training-1', 'upload-master', 'inventory-upload', 'ap-ar', 'fa', 'gl']) assert.equal(seed.items.find(it => it.id === id).pic, 'STEM', id);
});

test('balanceTimeline: 6 titik terurut, A/P dan A/R digabung, memakai tanggal aktual', () => {
  const steps = balanceTimeline(seed.items);
  assert.deepEqual(steps.map(s => s.title), ['Cut off Inventory', 'Serah & upload Inventory', 'Cut off A/P, A/R, Fixed Asset, G/L', 'A/P dan A/R', 'Fixed Asset', 'G/L']);
  assert.deepEqual(steps.map(s => [s.startDate, s.endDate]), [['2026-12-31', '2026-12-31'], ['2026-12-31', '2026-12-31'], ['2026-12-31', '2026-12-31'], ['2027-01-05', '2027-01-07'], ['2027-01-11', '2027-01-12'], ['2027-01-13', '2027-01-14']]);
  assert.equal(steps[1].time, '19:00-20:00');
  const moved = seed.items.map(it => it.id === 'balance-ar' ? { ...it, handoverDate: '2027-01-04', uploadDate: '2027-01-08' } : it);
  const ap = balanceTimeline(moved).find(s => s.title === 'A/P dan A/R');
  assert.deepEqual([ap.startDate, ap.endDate], ['2027-01-04', '2027-01-08']);
  assert.deepEqual(balanceTimeline([]), []);
});

test('cardNote: huruf awal kapital', () => { assert.equal(cardNote('Jumat; data terakhir master.'), 'Data terakhir master.'); });

test('Training satu hari: status milestone mengikuti baris Training, tanpa hari kedua', () => {
  const base = seed.items;
  assert.equal(base.filter(it => it.section === 'training').length, 1);
  assert.ok(!base.some(it => it.id === 'training-2'));
  const m = base.find(it => it.id === 'training');
  assert.deepEqual([m.title, m.startDate, m.endDate], ['Training', '2026-12-14', '2026-12-14']);
  const st = v => withTrainingRollup(base.map(it => it.id === 'training-1' ? { ...it, status: v } : it)).find(it => it.id === 'training').status;
  assert.equal(st('belum'), 'belum'); assert.equal(st('proses'), 'proses'); assert.equal(st('selesai'), 'selesai');
  assert.equal(rollupStatus([]), null);
});

test('cardNote: tiap potongan kalimat diawali kapital', () => { assert.equal(cardNote('Pengenalan SAP B1; semua user.'), 'Pengenalan SAP B1. Semua user.'); });

test('withSubmitRange: upload A/P-A/R, FA, G/L tampil sebagai rentang serah -> upload', () => {
  const e = id => { const it = seed.items.find(i => i.id === id); return withSubmitRange({ id, title: it.title, startDate: it.startDate, endDate: it.endDate, note: '' }, seed.items); };
  assert.deepEqual([e('ap-ar').startDate, e('ap-ar').endDate, e('ap-ar').title], ['2027-01-05', '2027-01-07', 'Serah & upload A/P dan A/R']);
  assert.deepEqual([e('fa').startDate, e('fa').endDate, e('fa').title], ['2027-01-11', '2027-01-12', 'Serah & upload Fixed Asset']);
  assert.deepEqual([e('gl').startDate, e('gl').endDate], ['2027-01-13', '2027-01-14']);
  const kick = { id: 'kickoff', title: 'Kick Off', startDate: '2026-12-01', endDate: '2026-12-01' };
  assert.equal(withSubmitRange(kick, seed.items), kick);
  assert.deepEqual(withSubmitRange({ id: 'fa', title: 'Upload Fixed Asset', startDate: '2027-01-12', endDate: '2027-01-12' }, []).startDate, '2027-01-12');
});

test('inventory: serah (PPMK, PIC bebas) dan upload (STEM, PIC tetap) jadi dua kegiatan', () => {
  const serah = seed.items.find(it => it.id === 'inventory'), upload = seed.items.find(it => it.id === 'inventory-upload');
  assert.equal(serah.title, 'Serah inventory ke STEM'); assert.equal(serah.pic, '');
  assert.equal(upload.title, 'Upload inventory ke SAP'); assert.equal(upload.pic, 'STEM'); assert.equal(upload.cutover, true);
  assert.ok(isStemItem('inventory-upload') && !isStemItem('inventory'));
  assert.equal(seed.items.findIndex(it => it.id === 'inventory-upload'), seed.items.findIndex(it => it.id === 'inventory') + 1);
});

test('stock opname 29-31 Des, cut off inventory 31 Des, training untuk IT Branch', () => {
  const g = id => seed.items.find(it => it.id === id);
  assert.deepEqual([g('opname').startDate, g('opname').endDate], ['2026-12-29', '2026-12-31']);
  assert.equal(g('cutoff').endDate, '2026-12-31');
  assert.equal(g('balance-inv').cutoffDate, '2026-12-31');
  assert.ok(g('balance-inv').cutoffDate <= g('balance-inv').handoverDate && g('balance-inv').handoverDate <= g('balance-inv').uploadDate);
  assert.equal(g('training').note, 'IT Branch');
  assert.equal(g('training-1').note, 'IT Branch');
});

test('mergeUsers: hanya user SAP, nama dari list, list dipakai bila SAP gagal', () => {
  const sap = [{ code: 'AP-STF1', name: 'AP-STF1' }, { code: 'AR-STF2', name: 'AR-STF2' }];
  const list = [{ code: 'AP-STF1', name: 'Fatma' }, { code: 'CSH-STF1', name: 'Nina' }, { code: 'PUR-MGR1', name: '' }, null, { name: 'tanpa kode' }];
  const out = mergeUsers(sap, list);
  assert.deepEqual(out.map(u => [u.code, u.name]), [['AP-STF1', 'Fatma'], ['AR-STF2', 'AR-STF2']]);
  assert.equal(picOptions(out).find(o => o.value === 'PPMK:AP-STF1').label, 'AP-STF1 (Fatma)');
  assert.equal(picOptions(out).find(o => o.value === 'PPMK:AR-STF2').label, 'AR-STF2');
  assert.deepEqual(mergeUsers([], list, false).map(u => u.code), ['AP-STF1', 'CSH-STF1', 'PUR-MGR1']);
  assert.equal(sap[0].name, 'AP-STF1');
});
