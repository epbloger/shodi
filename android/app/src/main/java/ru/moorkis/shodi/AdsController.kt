package ru.moorkis.shodi

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.SystemClock
import android.view.View
import android.widget.*
import com.yandex.mobile.ads.banner.*
import com.yandex.mobile.ads.common.*
import com.yandex.mobile.ads.interstitial.*
import com.yandex.mobile.ads.nativeads.*

class AdsController(private val activity: Activity, private val slot: FrameLayout) {
    private var personalized: Boolean? = null
    private var requestGeneration = 0
    private var initialized = false
    private var initializing = false
    private var closed = false
    private var foreground = false
    private var catalog = false
    private var banner: BannerAdView? = null
    private var bannerLoaded = false
    private var interstitialLoader: InterstitialAdLoader? = null
    private var interstitial: InterstitialAd? = null
    private var nativeLoader: NativeAdLoader? = null
    private var nativeAd: NativeAd? = null
    private var nativeView: NativeAdView? = null
    private var nativeRequested = false
    private var fullLoading = false
    private var fullShowing = false
    private var nextBanner = 0L
    private var nextFull = 0L
    private var lastFull = SystemClock.elapsedRealtime()
    private val interval = 6 * 60 * 1000L

    private fun online(): Boolean {
        val cm = activity.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        return cm.getNetworkCapabilities(cm.activeNetwork)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
    }
    private fun eligible() = personalized != null && initialized && foreground && catalog && !closed && !fullShowing && online()
    fun setPersonalization(value: Boolean) {
        if (closed) return
        foreground = true
        if (personalized != value) {
            // Invalidate previous creatives and asynchronous callbacks before changing consent.
            requestGeneration++
            clear()
            personalized = value
            nextBanner = 0L
            nextFull = 0L
            nativeRequested = false
        }
        // Pass the actual choice every resume, including false; do not disable
        // all ad formats merely because personalization was declined.
        YandexAds.setUserConsent(value)
        YandexAds.setLocationTracking(false)
    }
    private fun initializeIfNeeded() {
        if (personalized == null || initialized || initializing || closed || !online()) return
        initializing = true
        YandexAds.initialize(activity.applicationContext) {
            initializing = false
            if (!closed) initialized = true
        }
    }
    fun update(isCatalog: Boolean, returned: Boolean) {
        if (closed) return
        foreground = true
        catalog = isCatalog
        if (personalized == null || !online() || !catalog) {
            slot.visibility = View.GONE
            if (!online()) { clearBanner(); clearNative() }
            return
        }
        if (!initialized) { initializeIfNeeded(); return }
        if (fullShowing) { slot.visibility = View.GONE; return }
        if (returned && SystemClock.elapsedRealtime() - lastFull >= interval && interstitial != null) {
            showFull()
            return
        }
        preloadFull()
        if (returned && !nativeRequested) loadNative()
        if (nativeView != null) {
            slot.visibility = View.VISIBLE
            return
        }
        if (banner == null && SystemClock.elapsedRealtime() >= nextBanner) loadBanner()
        slot.visibility = if (bannerLoaded) View.VISIBLE else View.GONE
    }
    private fun loadBanner() {
        if (!eligible()) return
        val width = (slot.width / activity.resources.displayMetrics.density).toInt()
        val actualWidth = if (width > 0) width else activity.resources.configuration.screenWidthDp
        if (actualWidth < 120) return
        nextBanner = SystemClock.elapsedRealtime() + 120_000
        val ad = BannerAdView(activity)
        banner = ad
        val size = BannerAdSize.sticky(activity, actualWidth)
        ad.setAdSize(size)
        ad.setBannerAdEventListener(object : BannerAdEventListener {
            override fun onAdLoaded() {
                if (banner !== ad) return
                bannerLoaded = true
                if (eligible() && nativeView == null) slot.visibility = View.VISIBLE
            }
            override fun onAdFailedToLoad(error: AdRequestError) {
                if (banner === ad) clearBanner()
            }
            override fun onAdClicked() {}
            override fun onImpression(data: ImpressionData?) {}
        })
        slot.addView(ad, FrameLayout.LayoutParams(size.getWidthInPixels(activity), size.getHeightInPixels(activity), android.view.Gravity.CENTER))
        ad.loadAd(AdRequest.Builder(BuildConfig.BANNER_ID).build())
    }
    private fun preloadFull() {
        if (!eligible() || interstitial != null || fullLoading || SystemClock.elapsedRealtime() < nextFull) return
        nextFull = SystemClock.elapsedRealtime() + interval
        val loader = interstitialLoader ?: InterstitialAdLoader(activity).also { interstitialLoader = it }
        fullLoading = true
        val generation = requestGeneration
        loader.loadAd(AdRequest.Builder(BuildConfig.INTERSTITIAL_ID).build(), object : InterstitialAdLoadListener {
            override fun onAdLoaded(ad: InterstitialAd) {
                if (generation != requestGeneration || closed) return
                fullLoading = false
                interstitial = ad
            }
            override fun onAdFailedToLoad(error: AdRequestError) {
                if (generation == requestGeneration) fullLoading = false
            }
        })
    }
    private fun showFull() {
        if (!eligible() || activity.isFinishing || activity.isDestroyed) return
        val ad = interstitial ?: return
        fullShowing = true
        slot.visibility = View.GONE
        lastFull = SystemClock.elapsedRealtime()
        ad.setAdEventListener(object : InterstitialAdEventListener {
            override fun onAdShown() {}
            override fun onAdFailedToShow(error: AdError) { finishFull() }
            override fun onAdDismissed() { finishFull() }
            override fun onAdClicked() {}
            override fun onAdImpression(data: ImpressionData?) {}
        })
        ad.show(activity)
    }
    private fun finishFull() {
        interstitial?.setAdEventListener(null)
        interstitial = null
        fullShowing = false
    }

    private fun loadNative() {
        if (!eligible()) return
        nativeRequested = true // at most one native request per activity session
        val loader = NativeAdLoader(activity)
        nativeLoader = loader
        val generation = requestGeneration
        loader.loadAd(AdRequest.Builder(BuildConfig.NATIVE_ID).build(),
            NativeAdOptions.Builder().setShouldLoadImagesAutomatically(true).build(),
            object : NativeAdLoadListener {
                override fun onAdLoaded(ad: NativeAd) {
                    if (generation != requestGeneration || !eligible()) return
                    bindNative(ad)
                }
                override fun onAdFailedToLoad(error: AdRequestError) {}
            })
    }

    private fun bindNative(ad: NativeAd) {
        val view = NativeAdView(activity)
        val panel = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            val p = (8 * resources.displayMetrics.density).toInt()
            setPadding(p,p,p,p)
            setBackgroundColor(Color.rgb(236,241,252))
        }
        fun label(size: Float = 12f) = TextView(activity).apply {
            textSize = size
            setTextColor(Color.rgb(23,34,53))
        }
        val header = LinearLayout(activity).apply { orientation = LinearLayout.HORIZONTAL }
        val sponsored = label()
        val age = label()
        val feedback = ImageView(activity)
        header.addView(label().apply { text = "Реклама  " })
        header.addView(sponsored, LinearLayout.LayoutParams(0,-2,1f))
        header.addView(age)
        header.addView(feedback, LinearLayout.LayoutParams(48,48))
        panel.addView(header)
        val title = label(16f)
        val body = label(13f)
        val domain = label()
        val warning = label()
        val icon = ImageView(activity)
        val favicon = ImageView(activity)
        val price = label()
        val count = label()
        val rating = object : RatingBar(activity, null, android.R.attr.ratingBarStyleSmall), Rating {}
        val media = MediaView(activity)
        val cta = Button(activity)
        panel.addView(title)
        panel.addView(body)
        panel.addView(domain)
        panel.addView(price)
        panel.addView(count)
        panel.addView(rating)
        panel.addView(icon, LinearLayout.LayoutParams(64,64))
        panel.addView(favicon, LinearLayout.LayoutParams(32,32))
        panel.addView(media, LinearLayout.LayoutParams(-1, (100 * activity.resources.displayMetrics.density).toInt()))
        panel.addView(warning)
        panel.addView(cta)
        // Scroll separately, so large creatives never cover the catalog or navigation.
        val scroll = ScrollView(activity).apply { addView(panel) }
        view.addView(scroll, FrameLayout.LayoutParams(-1, (180 * activity.resources.displayMetrics.density).toInt()))
        val binder = NativeAdViewBinder.Builder(view)
            .setAgeView(age).setSponsoredView(sponsored).setFeedbackView(feedback)
            .setTitleView(title).setBodyView(body).setDomainView(domain).setWarningView(warning)
            .setIconView(icon).setFaviconView(favicon).setPriceView(price).setReviewCountView(count)
            .setRatingView(rating).setMediaView(media).setCallToActionView(cta).build()
        if (ad.bindNativeAd(binder) is AdBindingResult.Success) {
            clearBanner()
            nativeAd = ad
            nativeView = view
            slot.addView(view)
            slot.visibility = View.VISIBLE
        }
    }
    private fun clearBanner() {
        banner?.let { slot.removeView(it); it.destroy() }
        banner = null
        bannerLoaded = false
        if (nativeView == null) slot.visibility = View.GONE
    }
    private fun clearNative() {
        nativeLoader?.cancelLoading()
        nativeLoader = null
        nativeAd?.setNativeAdEventListener(null)
        nativeAd = null
        nativeView?.let { slot.removeView(it) }
        nativeView = null
        slot.visibility = View.GONE
    }
    private fun clear() {
        clearBanner(); clearNative()
        interstitialLoader?.cancelLoading()
        interstitialLoader = null
        fullLoading = false
        finishFull()
    }
    fun pause() { foreground = false; slot.visibility = View.GONE }
    fun resize() { clearBanner(); nextBanner = 0L }
    fun destroy() { closed = true; requestGeneration++; clear() }
}
