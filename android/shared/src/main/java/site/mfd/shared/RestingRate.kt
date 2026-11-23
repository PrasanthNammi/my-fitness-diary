package site.mfd.shared

/**
 * Resting heart rate when no app writes one to Health Connect (Samsung Health doesn't): the lowest 30-minute average
 * of the heart rate during the night's sleep, the usual way to measure a sleeping resting rate. Needs at least 3
 * readings spread over 20+ minutes in a window, and a value in a human range; otherwise null.
 */
object RestingRate {
    private const val WINDOW = 30 * 60_000L

    /** `samples`: (epoch ms, bpm) from the sleep's start to its end. */
    fun lowest30(samples: List<Pair<Long, Long>>): Long? {
        val s = samples.filter { it.second in 25..220 }.sortedBy { it.first }
        var best: Double? = null
        var j = 0
        for (i in s.indices) {
            if (j < i) j = i
            while (j + 1 < s.size && s[j + 1].first < s[i].first + WINDOW) j++
            val n = j - i + 1
            if (n >= 3 && s[j].first - s[i].first >= 20 * 60_000L) {
                val mean = s.subList(i, j + 1).sumOf { it.second }.toDouble() / n
                if (best == null || mean < best) best = mean
            }
        }
        return best?.let { Math.round(it) }?.takeIf { it in 30..120 }
    }
}
