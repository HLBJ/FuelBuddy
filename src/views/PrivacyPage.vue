<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/settings" />
        </ion-buttons>
        <ion-title>Privacy</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding privacy">
      <h2>Your data stays on your phone</h2>
      <p>
        Vehicles, fill-ups, reminders, logbook trips and settings are stored only in a database on this device. FuelBuddy has no account,
        no server and no cloud sync, and it never uploads your fuel records.
      </p>

      <h2>Route planner (online)</h2>
      <p>
        The route planner is the only part of FuelBuddy that sends trip information off your phone. When you use it,
        the place names you search for and the start and destination you choose are sent to OpenStreetMap community
        services (Photon by Komoot for search, the FOSSGIS routing server for directions) and map images are loaded
        from OpenStreetMap. If you tap "Use my location", your approximate position is used once to fill in the
        start point; FuelBuddy does not track your location. Fuel stations and toll plazas come from data built into
        the app. "Navigate in Google Maps" hands the route to Google Maps, under Google's privacy policy. Your fuel
        log is never sent anywhere.
      </p>

      <h2>Scanning fuel slips</h2>
      <p>
        When you tap "Scan fuel slip", you take a photo with Android's camera app or pick one with Android's photo
        picker. The text on the slip is read on your phone by Google's ML Kit; the photo is not uploaded and is
        not kept by FuelBuddy. FuelBuddy does not have camera or photo-library permission.
      </p>
      <h2>Fuel prices</h2>
      <p>
        Official fuel prices are built into the app. FuelBuddy may also download a small file of newer prices
        from the internet; that request contains no information about you or your vehicles.
      </p>
      <h2>No tracking</h2>
      <p>FuelBuddy contains no analytics, telemetry or crash-reporting services.</p>

      <h2>Exports and backups</h2>
      <p>
        When you export to CSV, export your travel logbook or back up your data, the file is created on your phone
        and handed to the app you choose in the share sheet (for example Google Drive or email). Where it goes from
        there is up to you. A backup file contains all your FuelBuddy data, so keep it somewhere private.
      </p>

      <h2>Advertising (free version)</h2>
      <p>
        The free version shows banner ads from Google AdMob. Google may use device identifiers to serve ads; where
        required by law you will be asked for consent first. Ad providers never receive your fuel or vehicle data.
        FuelBuddy Pro removes ads completely.
      </p>

      <h2>Purchases</h2>
      <p>
        Pro is bought through Google Play. Payment details are handled by Google; FuelBuddy only learns whether Pro
        has been purchased.
      </p>

      <h2>Android device backup</h2>
      <p>
        Separately, Android may include app data in your personal device backup if you have enabled it in your phone's settings.
        That backup belongs to your Google account and is controlled by Android, not by FuelBuddy.
      </p>

      <h2>Deleting your data</h2>
      <p>Settings → Delete all data removes all vehicles, fill-ups, reminders and trips. Uninstalling FuelBuddy deletes its database.</p>

      <h2>Permissions</h2>
      <p>
        FuelBuddy uses internet access for ads, Google Play purchases, fuel prices and the route planner. Location
        is requested only when you tap "Use my location" in the route planner. Notifications are used for your
        reminders and fuel price alerts. FuelBuddy does not access your contacts, and only sees a photo or file
        you choose yourself.
      </p>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { IonBackButton, IonButtons, IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/vue'
</script>

<style scoped>
.privacy h2 {
  font-size: 1.05rem;
  margin: 20px 0 6px;
}
.privacy h2:first-child {
  margin-top: 4px;
}
.privacy p {
  margin: 0;
  line-height: 1.55;
  color: var(--fb-text-muted);
}
</style>
