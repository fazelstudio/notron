# Instruksi Rekonstruksi Total UI Notron

> Dokumen ini adalah spesifikasi kerja untuk AI Agent yang bertugas merombak arsitektur tema/UI aplikasi **Notron** (Tauri V2 + Svelte 5 + Rust + CodeMirror 6 + Bun). Tujuannya: menyatukan penggunaan warna per-region agar konsisten, modular, dan siap menampung sistem Extension di masa depan.

---

## 1. Latar Belakang & Masalah

Saat ini UI Notron terasa seperti gabungan potongan-potongan yang masing-masing punya sumber warna sendiri (hardcoded / terpisah dari sistem tema utama). Contoh nyata: area kode editor dan area line number/gutter memiliki warna yang berbeda padahal secara konsep keduanya adalah **satu region** ("Editor Surface") yang seharusnya berbagi satu warna latar.

Akar masalahnya adalah **tidak adanya lapisan token warna terpusat** yang menjembatani tema CodeMirror 6 (dari `@uiw/codemirror-themes-all`) dengan warna shell aplikasi (title bar, sidebar, status bar, dll). Setiap komponen saat ini kemungkinan mendefinisikan warnanya sendiri-sendiri.

## 2. Prinsip Desain Inti

Agent harus menegakkan prinsip berikut selama rekonstruksi:

1. **Satu Region, Satu Warna Dasar.** Jika secara visual dan fungsional beberapa elemen membentuk satu area yang sama (mis. gutter + konten kode + minimap track), mereka WAJIB berbagi satu variabel warna latar, bukan warna terpisah yang kebetulan mirip.
2. **Pemisah Menggunakan Border, Bukan Warna.** Ketika dua region berbeda fungsi bersebelahan tanpa perlu dibedakan warnanya (mis. mode High Contrast), gunakan border tipis 1px sebagai pemisah visual, bukan mengandalkan perbedaan warna latar.
3. **Diferensiasi Warna Hanya Jika Bermakna.** Warna berbeda antar sub-area hanya dipakai jika ia menyampaikan makna/fungsi (mis. indikator per-panel Sidebar seperti Explorer vs Search bisa punya aksen berbeda pada tema tertentu), bukan karena kebetulan warisan kode lama.
4. **Tema adalah Data, Bukan Style Tersebar.** Semua warna berasal dari satu sumber kebenaran (token map), lalu dikonsumsi oleh komponen. Tidak boleh ada nilai warna hex/rgb yang ditulis langsung di dalam komponen Svelte.
5. **Modular untuk Extension.** Setiap token warna yang dipakai oleh shell inti harus tersedia juga untuk kode Extension di masa depan, sehingga panel/view buatan extension otomatis mengikuti tema aktif tanpa perlu tahu detail implementasi tema.
6. **Adaptif per Mode.** Sistem token harus mendukung dua gaya tema sekaligus:
   - **Tema Normal** (warna kaya, tiap region boleh sedikit berbeda nuansa).
   - **Tema High Contrast** (satu warna latar untuk hampir semua region, dipisahkan border, kontras maksimum untuk teks/border).

## 3. Arsitektur Token Warna (3 Lapisan)

Agent membangun sistem token 3 lapisan, mengikuti pola "primitive → semantic → component":

### Lapisan 1 — Primitive Tokens
Nilai warna mentah hasil ekstraksi dari tema CodeMirror yang dipilih (lihat Bab 5), contoh penamaan:
```
--nt-prim-bg-base
--nt-prim-bg-elevated
--nt-prim-fg-base
--nt-prim-fg-muted
--nt-prim-accent
--nt-prim-border
--nt-prim-selection
--nt-prim-cursor
```

### Lapisan 2 — Semantic/Region Tokens
Token ini yang dikonsumsi komponen. Namanya menjelaskan **region**, bukan warna:
```
--nt-titlebar-bg
--nt-titlebar-fg
--nt-titlebar-border

--nt-activitybar-bg
--nt-activitybar-fg
--nt-activitybar-fg-active
--nt-activitybar-indicator

--nt-sidebar-bg
--nt-sidebar-fg
--nt-sidebar-header-bg
--nt-sidebar-border

--nt-editor-bg          /* dipakai bersama oleh konten kode & gutter & minimap track */
--nt-editor-fg
--nt-editor-gutter-fg
--nt-editor-line-highlight
--nt-editor-selection
--nt-editor-cursor
--nt-editor-border

--nt-tabbar-bg
--nt-tab-active-bg
--nt-tab-inactive-bg
--nt-tab-border

--nt-statusbar-bg
--nt-statusbar-fg

--nt-panel-bg           /* terminal/output/problems jika sudah ada atau direncanakan */
--nt-panel-border

--nt-overlay-bg         /* command palette, context menu, quick input */
--nt-overlay-border
```
Setiap token semantic di-*resolve* dari token primitive, bukan diisi manual per komponen. Jika sebuah region secara desain memang harus identik dengan region lain (misal editor gutter = editor content), token semantic-nya harus **alias langsung** ke token yang sama, bukan didefinisikan ulang dengan nilai yang "kebetulan sama".

### Lapisan 3 — Component Overrides (opsional, dibatasi)
Hanya dipakai untuk kasus sangat spesifik (mis. warna badge notifikasi). Harus tetap mereferensikan token Lapisan 2/1, tidak boleh hex baru.

## 4. Peta Region & Aturan Penyatuan

Agent melakukan audit menyeluruh terhadap struktur komponen Svelte saat ini, lalu memetakan setiap elemen visual ke salah satu region berikut. Region yang harus disatukan warnanya secara internal:

| Region | Elemen yang harus 1 warna dasar |
|---|---|
| **Title Bar** | bar judul window, tombol window control (kecuali ikon) |
| **Activity Bar** | kolom ikon Explorer/Search/Source Control/Run/Extension |
| **Sidebar** | header panel + isi list/tree di Explorer/Search/Source Control/Run/Extension |
| **Editor Surface** | area kode, gutter/line number, indent guide track, minimap track, area kosong di bawah kode terakhir |
| **Tab Bar** | strip tab (tab aktif/nonaktif boleh beda, tapi berasal dari token yang sama, bukan hardcode) |
| **Status Bar** | seluruh bar status bawah |
| **Panel Bawah** (jika/ketika ada Terminal/Output) | isi panel |
| **Overlay** (command palette, context menu, quick input, tooltip) | latar overlay |

Aturan tambahan:
- Border antar region (mis. antara Sidebar dan Editor, antara Activity Bar dan Sidebar) memakai `--nt-*-border` masing-masing, tebal 1px, dan inilah satu-satunya elemen yang membedakan dua region saat mode High Contrast aktif.
- Sidebar boleh punya varian warna header vs isi HANYA jika tema non-high-contrast secara eksplisit mendefinisikannya; jika tidak, header dan isi sidebar berbagi token yang sama.

## 5. Theme Bridge — Menjembatani CodeMirror 6 dan UI Shell

Karena Notron memakai tema siap pakai dari `@uiw/codemirror-themes-all`, agent membangun modul **Theme Bridge** dengan tanggung jawab:

1. **Ekstraksi.** Ambil objek `settings` dari tema CM6 yang aktif (background, foreground, gutterBackground, gutterForeground, lineHighlight, selection, selectionMatch, cursor, dropdownBackground, dropdownBorder, dll — sesuai field yang tersedia pada tema tersebut).
2. **Normalisasi.** Petakan field tema CM6 tadi ke Lapisan 1 (Primitive Tokens). Jika suatu field tidak disediakan oleh tema tertentu, gunakan aturan fallback yang konsisten (mis. `gutterBackground` kosong → fallback ke `background` agar prinsip "satu warna" tetap terjaga, bukan fallback ke warna default library yang bisa berbeda).
3. **Injeksi.** Set seluruh token sebagai CSS custom properties di root aplikasi (mis. elemen `<html>` atau container utama) setiap kali tema berganti, sehingga baik komponen Svelte maupun `EditorView.theme` CodeMirror membaca dari sumber yang sama.
4. **Override Gutter Secara Eksplisit.** Karena inilah sumber masalah utama yang dilaporkan, saat membangun extension tema untuk CM6, gutter WAJIB diberi background yang mereferensikan `--nt-editor-bg`, bukan warna bawaan dari `@uiw/codemirror-themes-all`, walaupun tema aslinya menyediakan warna gutter berbeda. Ini adalah keputusan desain Notron: gutter dan konten kode adalah satu permukaan visual.
5. **Reaktivitas.** Gunakan store/state reaktif Svelte 5 (`$state`/`$derived` atau store context) agar pergantian tema langsung memicu re-render token tanpa reload.

Agent membuat satu modul terpisah (mis. `theme-bridge.ts`) yang murni bertugas transformasi data tema → token, terpisah dari logika UI komponen, agar mudah diuji dan dipakai ulang oleh sistem Extension.

## 6. Mode High Contrast

Untuk varian High Contrast (Dark & Light), agent memastikan:
- Hampir seluruh token Lapisan 2 (Title Bar, Activity Bar, Sidebar, Editor, Tab Bar, Status Bar, Panel) di-alias ke satu token primitive background tunggal.
- Semua border dinaikkan kontrasnya dan menjadi satu-satunya pembeda antar region.
- Fokus/selection state memakai outline solid tebal, bukan perubahan warna latar.
- Sistem token harus punya flag/mode (`isHighContrast: boolean`) yang bisa dibaca Theme Bridge untuk memutuskan strategi alias di atas, sehingga menambah tema High Contrast baru di masa depan tidak memerlukan perubahan kode komponen.

## 7. Modularitas untuk Sistem Extension

Karena Extension sedang dipersiapkan, seluruh hasil rekonstruksi harus mengikuti aturan modular berikut:

1. **Token sebagai Kontrak Publik.** Daftar token Lapisan 2 dianggap sebagai API tema yang stabil. Extension (panel baru di Activity Bar, view baru di Sidebar, dekorasi baru di Editor) hanya boleh mengonsumsi token ini, tidak boleh mengakses Theme Bridge internal atau tema CM6 mentah.
2. **Tidak Ada Warna Hardcode di Extension Host.** Saat membangun API/contribution point untuk extension (mis. mendaftarkan ikon Activity Bar baru, view container baru), pastikan API tersebut secara desain memaksa pemakaian token, misalnya dengan menyediakan CSS class/util yang sudah terikat token, bukan membiarkan extension menulis style bebas.
3. **Isolasi Modul.** Theme Bridge, Token Definition, dan Component Styling dipisah menjadi modul/file berbeda (lihat struktur Bab 9) agar extension system nantinya bisa mengimpor definisi token tanpa mengimpor seluruh logika UI shell.
4. **Dokumentasi Token.** Setiap token semantic diberi komentar singkat (region, tujuan pemakaian) agar dapat dijadikan referensi dokumentasi resmi Extension API di masa depan.

## 8. Rencana Eksekusi (Langkah demi Langkah untuk AI Agent)

1. **Audit.** Susuri seluruh komponen Svelte terkait UI shell (Title Bar, Activity Bar, Sidebar per-panel, Tab Bar, Editor container, Status Bar, overlay/menu) dan seluruh konfigurasi CM6 (`EditorView.theme`, ekstensi tema dari `@uiw/codemirror-themes-all`). Catat setiap warna hardcoded atau warna yang didefinisikan berulang.
2. **Definisikan Token.** Buat modul definisi token Lapisan 1 & 2 (Bab 3) sebagai satu sumber kebenaran.
3. **Bangun Theme Bridge.** Implementasikan modul sesuai Bab 5, termasuk aturan fallback dan override gutter.
4. **Migrasi Komponen.** Ganti seluruh nilai warna hardcoded pada komponen Svelte dengan referensi ke token semantic (CSS variable atau util class yang memetakan ke variable tersebut).
5. **Migrasi Konfigurasi CM6.** Bangun ulang ekstensi tema CodeMirror agar seluruh sub-bagian (background, gutter, activeLine, selection, cursor, tooltip/autocomplete) mengambil nilai dari token yang sama dengan yang dipakai shell, bukan langsung dari objek tema `@uiw` mentah.
6. **Terapkan Mode High Contrast.** Implementasikan strategi alias khusus (Bab 6) dan uji dengan minimal satu tema Dark High Contrast dan satu Light High Contrast.
7. **Uji Konsistensi Visual.** Untuk setiap tema yang didukung, verifikasi bahwa area yang seharusnya menyatu (terutama editor + gutter) benar-benar identik secara piksel/warna, dan bahwa perpindahan tema tidak meninggalkan warna lama (tidak ada style residual/hardcode yang lolos).
8. **Siapkan Kontrak Extension.** Ekspor token Lapisan 2 sebagai modul publik yang siap dipakai sistem Extension yang sedang dipersiapkan, lengkap dengan komentar dokumentasi (Bab 7.4).
9. **Bersihkan Kode Lama.** Hapus seluruh definisi warna lokal/hardcoded yang sudah digantikan oleh token, agar tidak ada dua sumber kebenaran yang berjalan bersamaan.

## 9. Struktur Berkas yang Disarankan

Agent bebas menyesuaikan dengan struktur proyek Notron yang sudah ada, namun disarankan pemisahan berikut agar modular:

```
src/
  theme/
    tokens.ts          # definisi & tipe token Lapisan 1 & 2
    theme-bridge.ts     # ekstraksi tema CM6 -> token, injeksi CSS variables
    high-contrast.ts    # strategi alias khusus mode high contrast
    cm6-theme.ts        # builder EditorView.theme berbasis token, dipakai editor
  ui/
    TitleBar.svelte
    ActivityBar.svelte
    Sidebar/
      ExplorerPanel.svelte
      SearchPanel.svelte
      SourceControlPanel.svelte
      RunPanel.svelte
      ExtensionPanel.svelte   # placeholder, ikut arsitektur token yang sama
    Editor/
      EditorSurface.svelte
    TabBar.svelte
    StatusBar.svelte
    Overlay/
      CommandPalette.svelte
      ContextMenu.svelte
```

## 10. Checklist Validasi Akhir

Agent menandai rekonstruksi selesai hanya jika seluruh poin berikut terpenuhi:

- [ ] Tidak ada nilai warna hex/rgb yang ditulis langsung di file `.svelte` maupun konfigurasi CM6; semua melalui token.
- [ ] Area gutter/line number dan area konten kode terbukti berbagi satu token background yang sama.
- [ ] Setiap region pada Bab 4 telah diverifikasi menyatu secara internal.
- [ ] Border dipakai secara konsisten sebagai pemisah, khususnya pada mode High Contrast.
- [ ] Berganti tema (termasuk ke/dari High Contrast) tidak menyisakan warna dari tema sebelumnya di bagian manapun.
- [ ] Token Lapisan 2 telah didokumentasikan dan diekspor sebagai kontrak yang bisa dipakai sistem Extension.
- [ ] Menambahkan tema CM6 baru dari `@uiw/codemirror-themes-all` tidak memerlukan perubahan pada komponen UI shell, cukup melalui Theme Bridge.
