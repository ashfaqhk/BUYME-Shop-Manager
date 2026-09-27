package app.buyme.shopmanager;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

import androidx.browser.customtabs.CustomTabsIntent;

public final class MainActivity extends Activity {
    private static final String PRODUCTION_URL =
            "https://buyme-shop-manager.replit.app/";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Uri destination = Uri.parse(PRODUCTION_URL);
        CustomTabsIntent customTab = new CustomTabsIntent.Builder()
                .setShowTitle(true)
                .setToolbarColor(Color.rgb(75, 64, 139))
                .build();

        try {
            customTab.launchUrl(this, destination);
        } catch (ActivityNotFoundException exception) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, destination));
            } catch (ActivityNotFoundException noBrowser) {
                Toast.makeText(this, "Install a web browser to use BUYME.",
                        Toast.LENGTH_LONG).show();
            }
        }
        finish();
    }
}