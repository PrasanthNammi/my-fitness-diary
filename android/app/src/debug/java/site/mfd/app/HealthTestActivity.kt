package site.mfd.app

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneId

/**
 * Debug builds only (never in the release app): writes sample data for testing the Health Connect reader.
 * `adb shell am start -n site.mfd.app/.HealthTestActivity`
 * Last night: 23:00–06:30 with 30 min awake at 02:00, plus an overlapping copy 23:30–06:00 (a second source);
 * expected 7.0 h. The night before: 22:30–05:42 (7.2 h). Steps: 4,321 today, 9,876 yesterday. Today: resting
 * heart rate 54, HRV 52.0 (48 and 56), weight 81.35 kg, body fat 18.4 %. Yesterday 18:00–19:00: a workout's heart rate
 * (95 rising to a 168 peak at 18:40).
 */
class HealthTestActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lifecycleScope.launch {
            try {
                val zone = ZoneId.systemDefault()
                val today = LocalDate.now()
                fun at(d: LocalDate, h: Int, m: Int) = d.atTime(h, m).atZone(zone).toInstant()
                val offset = zone.rules.getOffset(java.time.Instant.now())
                val y = today.minusDays(1); val yy = today.minusDays(2)
                val records = listOf(
                    SleepSessionRecord(at(y, 23, 0), offset, at(today, 6, 30), offset, Metadata.manualEntry(), stages = listOf(
                        SleepSessionRecord.Stage(at(y, 23, 0), at(today, 2, 0), SleepSessionRecord.STAGE_TYPE_LIGHT),
                        SleepSessionRecord.Stage(at(today, 2, 0), at(today, 2, 30), SleepSessionRecord.STAGE_TYPE_AWAKE),
                        SleepSessionRecord.Stage(at(today, 2, 30), at(today, 6, 30), SleepSessionRecord.STAGE_TYPE_DEEP),
                    )),
                    SleepSessionRecord(at(y, 23, 30), offset, at(today, 6, 0), offset, Metadata.manualEntry()),
                    SleepSessionRecord(at(yy, 22, 30), offset, at(y, 5, 42), offset, Metadata.manualEntry()),
                    StepsRecord(at(today, 8, 0), offset, at(today, 9, 0), offset, 4321, Metadata.manualEntry()),
                    StepsRecord(at(y, 10, 0), offset, at(y, 18, 0), offset, 9876, Metadata.manualEntry()),
                    // A workout yesterday 18:00–19:00: a sample every 2 s rising from 95 to a 168 peak at 18:40.
                    androidx.health.connect.client.records.HeartRateRecord(at(y, 18, 0), offset, at(y, 19, 0), offset,
                        (0 until 1800).map { i -> androidx.health.connect.client.records.HeartRateRecord.Sample(at(y, 18, 0).plusSeconds(i * 2L), (95 + (i * 73 / 1200).coerceAtMost(73) - if (i > 1200) (i - 1200) / 20 else 0).toLong()) },
                        Metadata.manualEntry()),
                    androidx.health.connect.client.records.RestingHeartRateRecord(at(today, 7, 0), offset, 54, Metadata.manualEntry()),
                    androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord(at(today, 3, 0), offset, 48.0, Metadata.manualEntry()),
                    androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord(at(today, 5, 0), offset, 56.0, Metadata.manualEntry()),
                    androidx.health.connect.client.records.WeightRecord(at(today, 7, 5), offset, androidx.health.connect.client.units.Mass.kilograms(81.35), Metadata.manualEntry()),
                    androidx.health.connect.client.records.BodyFatRecord(at(today, 7, 5), offset, androidx.health.connect.client.units.Percentage(18.4), Metadata.manualEntry()),
                )
                val client = HealthConnectClient.getOrCreate(this@HealthTestActivity)
                if (intent.getBooleanExtra("insert", true)) { client.insertRecords(records); Log.i("MFDHealthTest", "inserted ${records.size}") }
                val range = androidx.health.connect.client.time.TimeRangeFilter.between(at(y, 0, 0), at(today.plusDays(1), 0, 0))
                val raw = client.readRecords(androidx.health.connect.client.request.ReadRecordsRequest(StepsRecord::class, range)).records
                val agg = client.aggregate(androidx.health.connect.client.request.AggregateRequest(setOf(StepsRecord.COUNT_TOTAL), range))
                Log.i("MFDHealthTest", "steps raw=${raw.map { it.count + 0 }} origins=${raw.map { it.metadata.dataOrigin.packageName }} aggregate=${agg[StepsRecord.COUNT_TOTAL]} origins=${agg.dataOrigins.map { it.packageName }}")
            } catch (e: Exception) { Log.e("MFDHealthTest", "failed", e) }
            finish()
        }
    }
}
