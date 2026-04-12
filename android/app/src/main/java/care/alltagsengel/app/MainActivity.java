package care.alltagsengel.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Firebase explizit initialisieren, bevor Capacitor-Plugins geladen werden
        try {
            if (FirebaseApp.getApps(this).isEmpty()) {
                FirebaseApp.initializeApp(this);
            }
        } catch (Exception e) {
            // Firebase-Init fehlgeschlagen, App soll trotzdem weiterlaufen
            android.util.Log.w("AlltagsEngel", "Firebase init failed: " + e.getMessage());
        }
        super.onCreate(savedInstanceState);
    }
}
