package com.sundura.admin;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    private WebView myWebView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main); // Layout XML loading

        myWebView = findViewById(R.id.webview);

        // Configure WebView Client to prevent loading links in system browser
        myWebView.setWebViewClient(new WebViewClient());

        // Configure advanced WebView settings
        WebSettings webSettings = myWebView.getSettings();
        webSettings.setJavaScriptEnabled(true); // Crucial: Enables interactivity
        webSettings.setDomStorageEnabled(true); // Crucial: Enables localStorage/sessionStorage
        webSettings.setDatabaseEnabled(true);   // Enables local database access
        webSettings.setAllowFileAccess(true);   // Allows local files
        webSettings.setCacheMode(WebSettings.LOAD_DEFAULT); // Default caching behavior
        webSettings.setUseWideViewPort(true);   // Fits viewport to layout size
        webSettings.setLoadWithOverviewMode(true);

        // Load the Admin dashboard URL
        // TODO: Replace this URL with your production Vercel storefront domain
        // (Make sure to point specifically to your /admin/ directory or /admin/index.html)
        myWebView.loadUrl("https://your-vercel-domain.vercel.app/admin");

        // Handle native back presses to navigate backwards inside the WebView
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (myWebView.canGoBack()) {
                    myWebView.goBack();
                } else {
                    finish(); // Exit the app if no historical pages exist
                }
            }
        });
    }
}
