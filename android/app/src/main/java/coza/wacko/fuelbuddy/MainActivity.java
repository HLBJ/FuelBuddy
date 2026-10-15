package coza.wacko.fuelbuddy;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** A fuelbuddy:// link handed over by DeepLinkActivity; lives only as long as the process. */
    static Uri pendingLink;

    private static Intent takePendingLink() {
        Uri link = pendingLink;
        pendingLink = null;
        return link == null ? null : new Intent(Intent.ACTION_VIEW, link);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Cold start from a link: expose it to Capacitor as the launch URL.
        Intent link = takePendingLink();
        if (link != null) setIntent(link);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        // App already running: deliver the link like a new intent (fires appUrlOpen).
        Intent link = takePendingLink();
        if (link != null) onNewIntent(link);
    }
}
