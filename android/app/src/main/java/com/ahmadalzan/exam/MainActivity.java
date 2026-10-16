package com.ahmadalzan.exam;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.graphics.Color;
import android.util.Base64;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;

/**
 * منصة الامتحان المحوسب — علوم الإنتاج الحيواني
 * إعداد وتصميم: المهندس أحمد الزن
 *
 * نسخة تشخيصية: تعرض على الشاشة أي مشكلة تمنع تشغيل المنصة.
 */
public class MainActivity extends Activity {

    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final String START_URL = "https://appassets.androidapp.com/assets/www/index.html";
    private static final String FALLBACK_URL = "file:///android_asset/www/index.html";
    private static final String FALLBACK_FILE_URL = "file:///android_asset/www/index.html";

    private WebView web;
    private FrameLayout root;
    private LinearLayout overlay;
    private TextView overlayTitle;
    private TextView overlayBody;
    private LinearLayout overlayButtons;

    private ValueCallback<Uri[]> filePathCallback;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable timeoutRunnable;

    private boolean pageFinished = false;
    private boolean triedFallback = false;
    private final StringBuilder consoleLog = new StringBuilder();

    /* ------------------------------------------------------------------ */
    /* دورة الحياة                                                        */
    /* ------------------------------------------------------------------ */

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        try {
            super.onCreate(savedInstanceState);
        } catch (Throwable t) {
            showOnlyScreen("تعذر تشغيل النافذة", describe(t), true);
            return;
        }

        String lastError = prefs().getString(ExamApp.KEY_LAST_ERROR, null);
        if (lastError != null && lastError.trim().length() > 0) {
            prefs().edit().remove(ExamApp.KEY_LAST_ERROR).apply();
            showOnlyScreen("تم إغلاق التطبيق سابقاً بسبب خطأ", lastError + "\n\n" + deviceInfo(), true);
            return;
        }

        boot();
    }

    private void boot() {
        try {
            buildUi();
        } catch (Throwable t) {
            showOnlyScreen("تعذر تشغيل المنصة", describe(t) + "\n\n" + deviceInfo(), true);
        }
    }

    private void buildUi() {
        root = new FrameLayout(this);

        web = new WebView(this);
        FrameLayout.LayoutParams webParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        root.addView(web, webParams);

        overlay = buildOverlayView();
        root.addView(overlay, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        setContentView(root);

        configureWeb();

        showOverlay("جارٍ تشغيل المنصة...", deviceInfo(), null, null);
        web.loadUrl(START_URL);
        startTimeout();
    }

    @Override
    protected void onDestroy() {
        cancelTimeout();
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    /* ------------------------------------------------------------------ */
    /* إعداد محرّك الويب                                                  */
    /* ------------------------------------------------------------------ */

    private void configureWeb() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setAllowContentAccess(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                try {
                    return loader.shouldInterceptRequest(request.getUrl());
                } catch (Throwable t) {
                    log("asset loader: " + describe(t));
                    return null;
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String scheme = u.getScheme() == null ? "" : u.getScheme();
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    String host = u.getHost() == null ? "" : u.getHost();
                    if ("appassets.androidapp.com".equals(host)) {
                        return false;
                    }
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, u));
                    } catch (Throwable ignored) {
                    }
                    return true;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageFinished = true;
                cancelTimeout();
                hideOverlay();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request,
                                        WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    String url = String.valueOf(request.getUrl());
                    String desc = String.valueOf(error.getDescription())
                            + " (كود " + error.getErrorCode() + ")";
                    onMainFrameError(url, desc);
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                log(m.messageLevel() + ": " + m.message()
                        + " @ " + m.sourceId() + ":" + m.lineNumber());
                return true;
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Throwable t) {
                    filePathCallback = null;
                    log("file chooser: " + describe(t));
                    return false;
                }
            }
        });

        web.addJavascriptInterface(new Bridge(), "AndroidApp");
    }

    private void onMainFrameError(String url, String desc) {
        if (!triedFallback && url.startsWith("https://appassets")) {
            triedFallback = true;
            log("فشل تحميل الأصول الداخلية، تجربة الطريقة البديلة");
            web.loadUrl(FALLBACK_URL);
            return;
        }
        showOverlay("تعذر تحميل المنصة",
                "الرابط: " + url + "\nالسبب: " + desc + "\n\n" + deviceInfo() + "\n" + logText(),
                "إظهار الصفحة على أي حال", new Runnable() {
                    @Override
                    public void run() {
                        hideOverlay();
                    }
                });
    }

    private void startTimeout() {
        cancelTimeout();
        timeoutRunnable = new Runnable() {
            @Override
            public void run() {
                if (!pageFinished) {
                    showOverlay("تأخر تحميل المنصة",
                            "لم تنتهِ الصفحة من التحميل خلال 15 ثانية.\n\n"
                                    + deviceInfo() + "\n" + logText(),
                            "إظهار الصفحة على أي حال", new Runnable() {
                                @Override
                                public void run() {
                                    hideOverlay();
                                }
                            });
                }
            }
        };
        handler.postDelayed(timeoutRunnable, 15000);
    }

    private void cancelTimeout() {
        if (timeoutRunnable != null) {
            handler.removeCallbacks(timeoutRunnable);
            timeoutRunnable = null;
        }
    }

    /* ------------------------------------------------------------------ */
    /* واجهة التشخيص                                                      */
    /* ------------------------------------------------------------------ */

    private LinearLayout buildOverlayView() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackgroundColor(Color.parseColor("#0b6142"));
        box.setPadding(dp(20), dp(28), dp(20), dp(20));
        box.setTextDirection(View.TEXT_DIRECTION_RTL);
        box.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);

        overlayTitle = new TextView(this);
        overlayTitle.setTextColor(Color.WHITE);
        overlayTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 19);
        overlayTitle.setGravity(Gravity.CENTER);
        overlayTitle.setTextDirection(View.TEXT_DIRECTION_RTL);
        box.addView(overlayTitle);

        ScrollView scroll = new ScrollView(this);
        LinearLayout.LayoutParams scrollParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        scrollParams.topMargin = dp(16);
        box.addView(scroll, scrollParams);

        overlayBody = new TextView(this);
        overlayBody.setTextColor(Color.parseColor("#e7f5ee"));
        overlayBody.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        overlayBody.setTextDirection(View.TEXT_DIRECTION_RTL);
        overlayBody.setTextIsSelectable(true);
        overlayBody.setPadding(dp(4), dp(4), dp(4), dp(4));
        scroll.addView(overlayBody);

        overlayButtons = new LinearLayout(this);
        overlayButtons.setOrientation(LinearLayout.HORIZONTAL);
        overlayButtons.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams btnParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        btnParams.topMargin = dp(14);
        box.addView(overlayButtons, btnParams);

        return box;
    }

    private void showOnlyScreen(String title, String body, boolean withCopyButton) {
        try {
            LinearLayout box = buildOverlayView();
            setContentView(box);
            overlay = box;
            showOverlay(title, body, "متابعة", new Runnable() {
                @Override
                public void run() {
                    boot();
                }
            });
            if (withCopyButton) {
                addCopyButton();
            }
        } catch (Throwable ignored) {
            // لا يمكن عرض أي شيء
        }
    }

    private void showOverlay(String title, String body, String buttonText, Runnable action) {
        if (overlay == null) {
            return;
        }
        overlay.setVisibility(View.VISIBLE);
        overlay.bringToFront();
        if (web != null && overlay.getParent() == root && buttonText == null) {
            web.setVisibility(View.INVISIBLE);
        }
        overlayTitle.setText(title);
        overlayBody.setText(body == null ? "" : body);
        overlayButtons.removeAllViews();
        if (buttonText != null) {
            Button b = new Button(this);
            b.setText(buttonText);
            b.setAllCaps(false);
            b.setTextDirection(View.TEXT_DIRECTION_RTL);
            if (action != null) {
                b.setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        action.run();
                    }
                });
            }
            overlayButtons.addView(b);
        }
    }

    private void hideOverlay() {
        if (overlay != null) {
            overlay.setVisibility(View.GONE);
        }
        if (web != null) {
            web.setVisibility(View.VISIBLE);
        }
    }

    private void addCopyButton() {
        Button copy = new Button(this);
        copy.setText("نسخ النص");
        copy.setAllCaps(false);
        copy.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                try {
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    if (cm != null) {
                        cm.setPrimaryClip(ClipData.newPlainText("exam-error",
                                overlayTitle.getText() + "\n" + overlayBody.getText()));
                        Toast.makeText(MainActivity.this, "تم نسخ النص", Toast.LENGTH_SHORT).show();
                    }
                } catch (Throwable ignored) {
                }
            }
        });
        overlayButtons.addView(copy);
    }

    /* ------------------------------------------------------------------ */
    /* معلومات التشخيص                                                    */
    /* ------------------------------------------------------------------ */

    private void log(String line) {
        consoleLog.append(line).append('\n');
        if (consoleLog.length() > 6000) {
            consoleLog.delete(0, consoleLog.length() - 6000);
        }
    }

    private String logText() {
        if (consoleLog.length() == 0) {
            return "لا توجد رسائل من الصفحة.";
        }
        return "رسائل الصفحة:\n" + consoleLog.toString();
    }

    private String deviceInfo() {
        StringBuilder sb = new StringBuilder();
        sb.append("الهاتف: ").append(Build.MANUFACTURER).append(' ').append(Build.MODEL).append('\n');
        sb.append("أندرويد: ").append(Build.VERSION.RELEASE)
                .append(" (API ").append(Build.VERSION.SDK_INT).append(")\n");
        sb.append("إصدار التطبيق: ").append(appVersion()).append('\n');
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                PackageInfo pi = WebView.getCurrentWebViewPackage();
                if (pi == null) {
                    sb.append("محرّك الويب: غير مثبت على الجهاز!\n");
                } else {
                    sb.append("محرّك الويب: ").append(pi.packageName)
                            .append(' ').append(pi.versionName).append('\n');
                }
            }
        } catch (Throwable ignored) {
        }
        return sb.toString();
    }

    private String appVersion() {
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            return pi.versionName + " (" + pi.versionCode + ")";
        } catch (Throwable t) {
            return "غير معروف";
        }
    }

    private String describe(Throwable t) {
        StringWriter sw = new StringWriter();
        t.printStackTrace(new PrintWriter(sw));
        return sw.toString();
    }

    private android.content.SharedPreferences prefs() {
        return getSharedPreferences(ExamApp.PREFS, MODE_PRIVATE);
    }

    private int dp(int value) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value,
                getResources().getDisplayMetrics());
    }

    /* ------------------------------------------------------------------ */
    /* الجسر مع الصفحة                                                    */
    /* ------------------------------------------------------------------ */

    public class Bridge {
        @JavascriptInterface
        public void saveFile(final String name, final String mime, final String base64) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(MainActivity.this, writeFile(name, mime, base64),
                            Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface
        public void printPage() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                        if (pm != null && web != null) {
                            final String job = "امتحان-الإنتاج-الحيواني";
                            pm.print(job, web.createPrintDocumentAdapter(job),
                                    new PrintAttributes.Builder().build());
                        }
                    } catch (Throwable t) {
                        log("print: " + describe(t));
                    }
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(
                        WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                filePathCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private String writeFile(String name, String mime, String base64) {
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            String safeName = name == null || name.trim().isEmpty() ? "exam-file.txt" : name;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                cv.put(MediaStore.Downloads.MIME_TYPE,
                        mime == null ? "application/octet-stream" : mime);
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) {
                    return "تعذر حفظ الملف";
                }
                OutputStream os = getContentResolver().openOutputStream(uri);
                if (os == null) {
                    return "تعذر حفظ الملف";
                }
                os.write(bytes);
                os.flush();
                os.close();
                return "تم حفظ الملف في مجلد التنزيلات: " + safeName;
            }

            File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) {
                return "تعذر حفظ الملف";
            }
            File out = new File(dir, safeName);
            FileOutputStream fos = new FileOutputStream(out);
            fos.write(bytes);
            fos.flush();
            fos.close();
            return "تم حفظ الملف: " + out.getAbsolutePath();
        } catch (Throwable t) {
            return "تعذر حفظ الملف: " + t.getMessage();
        }
    }
}
