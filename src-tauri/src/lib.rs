// Alltagsengel Desktop — App-Setup (von main.rs und später Mobile geteilt).
// Tauri v2 empfiehlt die Logik in der Library, damit dieselbe Codebasis
// Desktop- und Mobile-Targets bedienen kann.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Externe Links (tel:, mailto:, https außerhalb der App) im
        // System-Browser bzw. Standardprogramm öffnen.
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten der Alltagsengel Desktop-App");
}
