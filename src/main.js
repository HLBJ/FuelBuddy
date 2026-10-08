import { createApp } from 'vue'
import { IonicVue } from '@ionic/vue'
import App from './App.vue'
import router from './router/index.js'

/* Core CSS required for Ionic components to work properly */
import '@ionic/vue/css/core.css'
import '@ionic/vue/css/normalize.css'
import '@ionic/vue/css/structure.css'
import '@ionic/vue/css/typography.css'
import '@ionic/vue/css/padding.css'
import '@ionic/vue/css/text-alignment.css'
import '@ionic/vue/css/flex-utils.css'
import '@ionic/vue/css/display.css'

/* Dark palette applied via the `ion-palette-dark` class (see themeService) */
import '@ionic/vue/css/palettes/dark.class.css'

import './theme/variables.css'
import './theme/app.css'

const app = createApp(App).use(IonicVue, { mode: 'md' }).use(router)

router.isReady().then(() => app.mount('#app'))
