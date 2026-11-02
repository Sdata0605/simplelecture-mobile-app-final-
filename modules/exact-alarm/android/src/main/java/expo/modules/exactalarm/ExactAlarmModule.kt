package expo.modules.exactalarm

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExactAlarmModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExactAlarm")

    Function("canScheduleExactAlarms") {
      canScheduleExactAlarmsNow()
    }

    Function("openExactAlarmSettings") {
      openExactAlarmSettingsNow()
    }
  }

  // Below Android 12 exact alarms need no extra grant.
  private fun canScheduleExactAlarmsNow(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      return true
    }
    val context: Context = appContext.reactContext ?: return false
    val alarmManager: AlarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return false
    return alarmManager.canScheduleExactAlarms()
  }

  private fun openExactAlarmSettingsNow() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      return
    }
    val context: Context = appContext.reactContext ?: return
    val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
    intent.data = Uri.parse("package:" + context.packageName)
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(intent)
  }
}
