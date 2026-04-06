package com.vibeaccess.desktop

import android.content.Intent
import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onNewIntent(intent: Intent) {
    // Ensure singleTask Activity receives updated VIEW intents (deep links / app links)
    // and the WebView can access the latest intent data.
    super.onNewIntent(intent)
    setIntent(intent)
  }
}
