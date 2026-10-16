package com.ahmadalzan.exam;

import android.app.Application;
import android.content.Context;

import java.io.PrintWriter;
import java.io.StringWriter;

/**
 * يحتفظ بآخر خطأ حدث في التطبيق لعرضه على الشاشة عند التشغيل التالي.
 */
public class ExamApp extends Application {

    public static final String PREFS = "exam_diag";
    public static final String KEY_LAST_ERROR = "lastError";

    @Override
    public void onCreate() {
        super.onCreate();

        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        final Context ctx = getApplicationContext();

        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread thread, Throwable ex) {
                try {
                    StringWriter sw = new StringWriter();
                    ex.printStackTrace(new PrintWriter(sw));
                    ctx.getSharedPreferences(PREFS, MODE_PRIVATE)
                            .edit()
                            .putString(KEY_LAST_ERROR,
                                    "الخيط: " + thread.getName() + "\n" + sw.toString())
                            .commit();
                } catch (Throwable ignored) {
                    // لا شيء
                }
                if (previous != null) {
                    previous.uncaughtException(thread, ex);
                } else {
                    System.exit(2);
                }
            }
        });
    }
}
