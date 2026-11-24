package ru.moorkis.shodi

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowInsets
import android.webkit.*
import android.widget.*
import androidx.webkit.WebViewAssetLoader
import org.json.JSONArray

class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var ads: AdsController
    private lateinit var root: LinearLayout
    private lateinit var share: Button
    private val handler = Handler(Looper.getMainLooper())
    private val prefs by lazy { getSharedPreferences("privacy", MODE_PRIVATE) }
    private var active = false
    private var ready = false
    private var route = false
    private var editing = false
    private var destroyed = false
    private var legalDialogOpen = false
    private val consentRevision = "2026-11-24-draft-1"
    private val local = "https://appassets.androidplatform.net/assets/index.html"
    private val tick = object : Runnable {
        override fun run() {
            if (!active || destroyed) return
            if (ready) web.evaluateJavascript(
                "[location.hash==='#route',Boolean(document.querySelector('dialog[open]')),document.documentElement.dataset.theme==='dark']"
            ) { result ->
                if (!active || destroyed) return@evaluateJavascript
                runCatching {
                    val state = JSONArray(result)
                    val oldRoute = route
                    route = state.getBoolean(0)
                    editing = state.getBoolean(1)
                    share.visibility = if (route && !editing) View.VISIBLE else View.GONE
                    ads.update(!route && !editing && !legalDialogOpen, oldRoute && !route && !editing && !legalDialogOpen)
                }
            }
            handler.postDelayed(this, 1000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(25, 37, 59))
        }
        root.setOnApplyWindowInsetsListener { v, insets ->
            @Suppress("DEPRECATION")
            v.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop,
                insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            insets
        }
        val bar = LinearLayout(this).apply {
            gravity = android.view.Gravity.END
            setPadding(8, 0, 8, 0)
        }
        share = Button(this).apply {
            text = "Поделиться маршрутом"
            visibility = View.GONE
            setOnClickListener { shareRoute() }
        }
        bar.addView(share)
        bar.addView(Button(this).apply {
            text = "О приложении"
            setOnClickListener { aboutDialog() }
        })
        root.addView(bar)
        web = WebView(this)
        root.addView(web, LinearLayout.LayoutParams(-1, 0, 1f))
        val adSlot = FrameLayout(this).apply { visibility = View.GONE }
        root.addView(adSlot, LinearLayout.LayoutParams(-1, -2))
        setContentView(root)
        ads = AdsController(this, adSlot)
        configureWeb()
        web.loadUrl(local)
        if (prefs.getString("consent_revision", "") != consentRevision) {
            prefs.edit().putBoolean("ads_allowed", false).apply()
            privacyDialog()
        }
    }

    private fun configureWeb() {
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        WebView.setWebContentsDebuggingEnabled(false)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setGeolocationEnabled(false)
        }
        CookieManager.getInstance().setAcceptCookie(false)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false)
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val u = request.url
                if (u.scheme == "https" && u.host == "appassets.androidplatform.net" && u.path?.startsWith("/assets/") == true)
                    return loader.shouldInterceptRequest(u)
                if (u.scheme == "data") return null
                return WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", emptyMap(), java.io.ByteArrayInputStream(ByteArray(0)))
            }
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.toString().substringBefore('#') == local) return false
                if (request.isForMainFrame && request.hasGesture() && request.url.scheme == "https") openExternal(request.url)
                return true
            }
            override fun onPageFinished(view: WebView, url: String) {
                if (url.substringBefore('#') == local) ready = true
            }
        }
        web.webChromeClient = WebChromeClient()
    }

    private fun openExternal(uri: Uri) {
        try { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
        catch (_: Exception) { Toast.makeText(this, "Нет приложения для открытия ссылки", Toast.LENGTH_SHORT).show() }
    }

    private fun showLegal(title: String, filename: String, after: (() -> Unit)? = null) {
        legalDialogOpen = true
        ads.update(false, false)
        val raw = assets.open(filename).bufferedReader(Charsets.UTF_8).use { it.readText() }
        val body = raw.substringAfter("<main>").substringBefore("<footer>")
        val content = TextView(this).apply {
            setPadding(24, 12, 24, 12)
            text = android.text.Html.fromHtml(body, android.text.Html.FROM_HTML_MODE_LEGACY)
            textSize = 15f
            movementMethod = android.text.method.LinkMovementMethod.getInstance()
        }
        AlertDialog.Builder(this).setTitle(title)
            .setView(ScrollView(this).apply { addView(content) })
            .setPositiveButton("Закрыть", null)
            .setOnDismissListener { legalDialogOpen = false; after?.invoke() }
            .show()
    }

    private fun aboutDialog() {
        legalDialogOpen = true
        ads.update(false, false)
        val choices = arrayOf("Разработчик и поддержка", "Политика конфиденциальности",
            "Пользовательское соглашение", "Согласие на обработку данных для рекламы",
            "Источники данных и лицензии", "Настройки рекламы", "Сайт проекта")
        val files = arrayOf("about.html", "privacy.html", "terms.html", "consent.html", "licenses.html")
        AlertDialog.Builder(this).setTitle("Сходи · " + BuildConfig.VERSION_NAME)
            .setItems(choices) { _, i ->
                when (i) {
                    in 0..4 -> showLegal(choices[i], files[i])
                    5 -> privacyDialog()
                    6 -> openExternal(Uri.parse("https://epbloger.github.io/shodi/"))
                }
            }
            .setNegativeButton("Закрыть", null)
            .setOnDismissListener { legalDialogOpen = false }
            .show()
    }

    private fun privacyDialog() {
        legalDialogOpen = true
        ads.update(false, false)
        AlertDialog.Builder(this).setTitle("Отдельное согласие на рекламу")
            .setMessage("Разрешение добровольное. Все функции доступны без рекламы. Прежде чем дать согласие, ознакомьтесь с отдельным документом. Реклама использует SDK Яндекса и технические данные. Вы можете изменить выбор в разделе «О приложении».")
            .setPositiveButton("Прочитать согласие") { _, _ -> consentDialog() }
            .setNegativeButton("Без рекламы") { _, _ -> setAds(false) }
            .setNeutralButton("Политика") { _, _ -> showLegal("Политика конфиденциальности", "privacy.html") { privacyDialog() } }
            .setOnDismissListener { legalDialogOpen = false }
            .show()
    }

    private fun consentDialog() {
        legalDialogOpen = true
        ads.update(false, false)
        val raw = assets.open("consent.html").bufferedReader(Charsets.UTF_8).use { it.readText() }
        val content = TextView(this).apply {
            setPadding(24, 12, 24, 12)
            text = android.text.Html.fromHtml(raw.substringAfter("<main>").substringBefore("<footer>"), android.text.Html.FROM_HTML_MODE_LEGACY)
            textSize = 15f
        }
        AlertDialog.Builder(this).setTitle("Согласие на рекламную обработку данных")
            .setView(ScrollView(this).apply { addView(content) })
            .setPositiveButton("Разрешить рекламу") { _, _ -> setAds(true) }
            .setNegativeButton("Без рекламы") { _, _ -> setAds(false) }
            .setOnDismissListener { legalDialogOpen = false }
            .show()
    }

    private fun setAds(allowed: Boolean) {
        prefs.edit().putBoolean("ads_allowed", allowed)
            .putString("consent_revision", consentRevision)
            .putLong("consent_timestamp", System.currentTimeMillis()).apply()
        ads.setAllowed(allowed)
    }

    private fun shareRoute() {
        if (!ready || !route || editing) return
        // Read only the selected route, and only in response to this explicit button.
        web.evaluateJavascript("""(()=>{try{const b=JSON.parse(localStorage.getItem('weekend-atlas/v1'));const r=b.routes.find(x=>x.id===b.selected);return r?[r.name,r.city,r.note,...r.stops.map((s,i)=>(i+1)+'. '+s.name+(s.minutes?' · '+s.minutes+' мин':'')+(s.note?' — '+s.note:''))].filter(Boolean).join('\n'):''}catch{return ''}})()""") { result ->
            val text = runCatching { org.json.JSONTokener(result).nextValue() as? String }.getOrNull()
            if (!text.isNullOrBlank()) startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text)
            }, "Поделиться маршрутом"))
        }
    }

    @Deprecated("Use system back for this activity")
    override fun onBackPressed() {
        if (!ready) { super.onBackPressed(); return }
        web.evaluateJavascript("""(()=>{const d=document.querySelector('dialog[open]');if(d){d.close();return true}if(location.hash==='#route'){document.getElementById('guide-trigger').click();return true}return false})()""") {
            if (it != "true") finish()
        }
    }

    override fun onResume() {
        super.onResume()
        active = true
        web.onResume()
        ads.setAllowed(prefs.getBoolean("ads_allowed", false))
        handler.post(tick)
    }

    override fun onPause() {
        active = false
        handler.removeCallbacks(tick)
        ads.pause()
        web.onPause()
        super.onPause()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        ads.resize()
    }

    override fun onDestroy() {
        destroyed = true
        handler.removeCallbacksAndMessages(null)
        ads.destroy()
        root.removeView(web)
        web.destroy()
        super.onDestroy()
    }
}
