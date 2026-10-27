import smile from '@tabler/icons/outline/mood-smile.svg?url';
import map from '@tabler/icons/outline/sitemap.svg?url';
import route from '@tabler/icons/outline/route.svg?url';
import mail from '@tabler/icons/outline/mail.svg?url';
import subscription from '@tabler/icons/outline/square-plus.svg?url';
import exchange from '@tabler/icons/outline/arrows-exchange.svg?url';
import report from '@tabler/icons/outline/chart-line.svg?url';
import moon from '@tabler/icons/outline/moon.svg?url';
import palette from '@tabler/icons/outline/palette.svg?url';
import general from '@tabler/icons/outline/settings.svg?url';
import bell from '@tabler/icons/outline/bell.svg?url';
import monero from '@tabler/icons/outline/coin-monero.svg?url';
import security from '@tabler/icons/outline/shield-check.svg?url';
import cloud from '@tabler/icons/outline/cloud-upload.svg?url';
import lock from '@tabler/icons/outline/lock.svg?url';
import search from '@tabler/icons/outline/search.svg?url';
import updown from '@tabler/icons/outline/selector.svg?url';
import storage from '@tabler/icons/outline/archive.svg?url';
import help from '@tabler/icons/outline/help-circle.svg?url';
import keyboard from '@tabler/icons/outline/keyboard.svg?url';
import close from '@tabler/icons/outline/x.svg?url';
import next from '@tabler/icons/outline/chevron-right.svg?url';
import back from '@tabler/icons/outline/chevron-left.svg?url';

const icons={smile,map,route,mail,subscription,exchange,report,moon,palette,general,bell,monero,security,cloud,storage,help,keyboard,close,next,back,lock,search,updown};
export type SettingsIconName=keyof typeof icons;
export default function SettingsIcon(props:{name:SettingsIconName;class?:string}) {
  return <span aria-hidden="true" class={`settings-icon ${props.class??''}`} style={{'--settings-icon':`url("${icons[props.name]}")`}}/>;
}
