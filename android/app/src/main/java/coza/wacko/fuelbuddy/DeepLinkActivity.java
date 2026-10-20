package coza.wacko.fuelbuddy;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/**
 * Invisible entry point for fuelbuddy:// links (home-screen widget, app shortcuts).
 *
 * Android remembers the intent that first created a task and replays it whenever the
 * task is recreated, for example after the app was killed in the background or updated.
 * If MainActivity received the link directly, reopening the app later would jump to the
 * link's screen again. Instead this activity hands the link over in memory and opens
 * MainActivity like a normal launch, so the link is used exactly once.
 */
public class DeepLinkActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getIntent() != null && getIntent().getData() != null) {
            MainActivity.pendingLink = getIntent().getData();
        }
        Intent launch = new Intent(this, MainActivity.class)
            .setAction(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(launch);
        finish();
    }
}
