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
        Vehicles, fill-ups and settings are stored only in a database on this device. FuelBuddy has no account,
        no server and no cloud sync, and it never uploads your fuel records.
      </p>

      <h2>No tracking</h2>
      <p>FuelBuddy contains no analytics, telemetry or crash-reporting services.</p>

      <h2>Exports</h2>
      <p>
        When you export to CSV, the file is created on your phone and handed to the app you choose in the share
        sheet. Where it goes from there is up to you.
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

      <h2>Backups</h2>
      <p>
        Android may include app data in your personal device backup if you have enabled it in your phone's settings.
        That backup belongs to your Google account and is controlled by Android, not by FuelBuddy.
      </p>

      <h2>Deleting your data</h2>
      <p>Settings → Delete all data removes all vehicles and fill-ups. Uninstalling FuelBuddy deletes its database.</p>

      <h2>Permissions</h2>
      <p>
        FuelBuddy only uses internet access (for ads and Google Play purchases). It does not request access to your
        location, contacts, camera or files.
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
