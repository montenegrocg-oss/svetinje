import type { Locale } from "./config.ts";

export interface LegalLink {
  label: string;
  href: string;
}

export interface LegalSection {
  heading: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
  links?: readonly LegalLink[];
}

export interface LegalPageCopy {
  eyebrow: string;
  title: string;
  description: string;
  intro: string;
  updatedLabel: string;
  updatedDate: string;
  sections: readonly LegalSection[];
}

export interface StorageTableRow {
  item: string;
  type: string;
  purpose: string;
  transfer: string;
  duration: string;
}

export interface StoragePageCopy extends LegalPageCopy {
  inventoryHeading: string;
  inventoryIntro: string;
  tableCaption: string;
  headers: { item: string; type: string; purpose: string; transfer: string; duration: string };
  rows: readonly StorageTableRow[];
}

interface LegalLocaleCopy {
  footer: { privacy: string; storage: string };
  privacy: LegalPageCopy;
  storage: StoragePageCopy;
}

const cloudflarePrivacy = "https://www.cloudflare.com/privacypolicy/";
const cloudflareCookies = "https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/";
const mapTilerPrivacy = "https://www.maptiler.com/privacy-policy/";

export const legalCopy = {
  sr: {
    footer: {
      privacy: "Политика приватности",
      storage: "Колачићи и локално складиштење",
    },
    privacy: {
      eyebrow: "Правне информације",
      title: "Политика приватности",
      description: "Како svetinje.me обрађује техничке податке, користи инфраструктурне услуге и чува омиљене светиње у прегледачу.",
      intro: "Ова политика описује стварно понашање јавног сајта svetinje.me према тренутној имплементацији. Сајт нема корисничке налоге, јавне обрасце, огласне пикселе нити маркетиншко профилисање.",
      updatedLabel: "Ажурирано",
      updatedDate: "26. августа 2026.",
      sections: [
        {
          heading: "Ко управља сајтом и како да нас контактирате",
          paragraphs: [
            "Јавним веб-сајтом управља пројекат svetinje.me. У постојећим јавним подацима о пројекту није наведено посебно правно лице, поштанска адреса, телефон нити службеник за заштиту података.",
            "За питања о приватности, приступу подацима или исправци садржаја користите објављени контакт пројекта:",
          ],
          links: [{ label: "info@svetinje.me", href: "mailto:info@svetinje.me" }],
        },
        {
          heading: "Који подаци могу бити обрађени",
          paragraphs: [
            "При обичном HTTP захтјеву инфраструктура мора примити ограничене техничке податке. Они служе испоруци, безбједности и раду сајта, а не изградњи корисничког профила.",
          ],
          bullets: [
            "IP адреса, тражени URL, датум и вријеме, метод и статус захтјева;",
            "технички подаци прегледача и уређаја, user-agent и referrer када их прегледач пошаље;",
            "мрежни и безбједносни метаподаци потребни за кеширање, спречавање злоупотребе и дијагностику;",
            "ресурси и дио карте који су затражени од MapTiler-а; координате приказа карте нијесу GPS локација уређаја;",
            "изабрана општина или епархија када је њихов стабилни идентификатор дио URL-а;",
            "адреса е-поште и садржај поруке само ако нам се сами обратите е-поштом.",
          ],
        },
        {
          heading: "Сврхе и основ обраде",
          paragraphs: [
            "Технички подаци користе се за испоруку и кеширање страница и медија, приказ интерактивне карте, заштиту инфраструктуре, отклањање грешака и одговор на добровољно послату поруку.",
            "У мјери у којој је примјенљиво, основ је нужан технички рад услуге и легитимни интерес да се тражени садржај поуздано и безбједно испоручи. Омиљене светиње чувају се тек након јасне радње корисника ради функције коју је затражио. Сагласност се не наводи као основ за обраду за коју се у садашњој верзији сајта не тражи.",
          ],
        },
        {
          heading: "Пружаоци инфраструктуре",
          paragraphs: [
            "Cloudflare обезбјеђује хостинг, CDN, кеширање, мрежну и безбједносну инфраструктуру. Зато Cloudflare може примити техничке податке захтјева у обиму потребном за те услуге.",
            "При учитавању интерактивне карте прегледач непосредно тражи стилове, плочице, фонтове и друге картографске ресурсе од MapTiler инфраструктуре. MapTiler тада може примити IP адресу, тражене ресурсе, техничке податке захтјева и податке о поријеклу захтјева у мјери у којој их прегледач пошаље. Техничка провјера није открила засебан MapTiler рекламни трагач.",
            "Није потврђен тачан уговорни статус сваког добављача, сва мјеста обраде нити конфигурација контролне табле; зато ова политика не тврди више од провјереног понашања.",
          ],
          links: [
            { label: "Cloudflare Privacy Policy", href: cloudflarePrivacy },
            { label: "MapTiler Privacy Policy", href: mapTilerPrivacy },
          ],
        },
        {
          heading: "Омиљене светиње",
          paragraphs: [
            "Омиљене светиње чувају се искључиво у localStorage простору прегледача на уређају корисника. Чувају се само стабилни идентификатори које је корисник сам додао.",
            "Нема корисничког налога, а списак се не синхронизује са сервером svetinje.me нити се шаље трећој страни. Појединачни унос може се уклонити у интерфејсу; све локалне податке могуће је уклонити брисањем података сајта у прегледачу.",
          ],
        },
        {
          heading: "Филтери, календар и јавни медији",
          paragraphs: [
            "Филтери каталога за општину и епархију могу бити записани у URL-у. Такав URL може остати у историји прегледача и у уобичајеним инфраструктурним логовима ако се страница затражи са сервера; то се не користи за профилисање.",
            "Календар и јеванђелска читања учитавају се обичним GET захтјевима према самом сајту. Јавне фотографије могу се испоручивати са media.svetinje.me преко Cloudflare инфраструктуре.",
          ],
        },
        {
          heading: "Чување и међународна обрада",
          paragraphs: [
            "Технички логови чувају се не дуже него што је потребно за одговарајућу сврху, у складу са стварним подешавањима и политиком пружаоца услуге. Тачан рок за Cloudflare логове није потврђен и зато се овдје не измишља.",
            "MapTiler у својој политици наводи да IP адресе крајњих корисника за безбједносне провјере обрађује ограничено, до два мјесеца. Омиљене светиње остају у прегледачу док их корисник или прегледач не уклони.",
            "Cloudflare и MapTiler могу користити инфраструктуру или добављаче изван Црне Горе и Европског економског простора, зависно од уговора, подешавања и подизвођача. Тачне локације и механизми преноса морају се поново потврдити за јавни домен.",
          ],
        },
        {
          heading: "Ваша права",
          paragraphs: [
            "У зависности од примјенљивог права и околности, можете тражити информације и приступ подацима, исправку, брисање, ограничење обраде, уложити приговор и затражити преносивост када је примјенљива. Можете се жалити надлежном органу за заштиту података.",
            "Пошто су омиљене светиње локалне и нијесу на нашем серверу, пројекат нема њихову копију коју би могао доставити или избрисати; контролишете их у свом прегледачу. За остале захтјеве обратите се на објављени контакт.",
          ],
        },
        {
          heading: "Обавезност података и аутоматизоване одлуке",
          paragraphs: [
            "Нијесте дужни да отворите сајт, користите карту, додате омиљену светињу или пошаљете е-пошту. Без основних техничких података није могуће испоручити тражену страницу или картографски ресурс.",
            "Тренутна имплементација не продаје податке посјетилаца, не користи бихевиорално оглашавање, маркетиншко профилисање, рекламне пикселе нити аутоматизоване одлуке које производе правно или слично значајно дејство.",
          ],
        },
        {
          heading: "Спољни видео",
          paragraphs: [
            "Систем подржава приказ спољног видеа за записе који га имају, али у тренутној јавној верзији нема активног YouTube видеа. Ако такав садржај постане јаван, прије објављивања морају се поново провјерити начин учитавања, правни основ и потреба за додатном контролом приватности. YouTube се не представља као прималац података на свакој страници.",
          ],
        },
        {
          heading: "Измјене политике",
          paragraphs: [
            "Политику ћемо ажурирати када се промијени функционалност, инфраструктура или правни захтјеви. Након покретања домена svetinje.me потребна је посебна провјера колачића, локалног складиштења, мрежних одредишта и Cloudflare конфигурације у јавној верзији.",
          ],
        },
      ],
    },
    storage: {
      eyebrow: "Приватност у прегледачу",
      title: "Колачићи и локално складиштење",
      description: "Које колачиће и локално складиштење тренутно користи svetinje.me и како корисник може да их контролише.",
      intro: "Ова страница раздваја колачиће, localStorage и складиште које може да користи спољни пружалац услуге. Попис је заснован на тренутном изворном коду и техничкој провјери, а не на општем шаблону политике колачића.",
      updatedLabel: "Ажурирано",
      updatedDate: "26. августа 2026.",
      sections: [
        {
          heading: "Колачић није исто што и localStorage",
          paragraphs: [
            "Колачић је податак који домен може поставити у прегледач и који прегледач, зависно од правила, може слати уз HTTP захтјеве. localStorage је простор у прегледачу; његов садржај се не шаље серверу аутоматски.",
            "Svetinje.me тренутно не поставља сопствене аналитичке или огласне колачиће. Ово описује садашњу имплементацију, а не обећање да се технологија никада неће промијенити.",
          ],
        },
        {
          heading: "Како да управљате подацима",
          paragraphs: [
            "Омиљену светињу можете појединачно уклонити у интерфејсу. Све локалне податке можете уклонити преко подешавања прегледача за податке сајта. Блокирање колачића трећих страна може утицати на техничке механизме MapTiler/Cloudflare, али основни садржај сајта остаје одвојен од списка омиљених.",
          ],
        },
        {
          heading: "Зашто нема банера за сагласност",
          paragraphs: [
            "Садашњи сајт нема опционално аналитичко, огласно или маркетиншко складиштење за које би нудио избор „прихвати све“ или „одбиј све“. Зато није додат банер нити се чува запис о сагласности.",
            "Коначна процјена мора се поновити након покретања јавног домена svetinje.me, укључујући стварно понашање MapTiler `_cfuvid` колачића и конфигурацију Cloudflare контролне табле. Ако се уведе опционална обрада, биће додате одговарајуће контроле прије њеног активирања.",
          ],
        },
        {
          heading: "Политике спољних пружалаца",
          paragraphs: [
            "Cloudflare и MapTiler објављују сопствене информације о приватности и техничким колачићима. Њихове политике могу се мијењати независно од овог сајта.",
          ],
          links: [
            { label: "Cloudflare Cookies", href: cloudflareCookies },
            { label: "Cloudflare Privacy Policy", href: cloudflarePrivacy },
            { label: "MapTiler Privacy Policy", href: mapTilerPrivacy },
          ],
        },
      ],
      inventoryHeading: "Тренутни попис складиштења",
      inventoryIntro: "Попис не садржи измишљене аналитичке колачиће. Наведено је само оно што је потврђено у тренутном изворном коду или техничкој провјери.",
      tableCaption: "Колачићи и складиште прегледача које користи или може користити јавни сајт",
      headers: { item: "Назив / пружалац", type: "Врста", purpose: "Када и зашто", transfer: "Слање", duration: "Трајање и контрола" },
      rows: [
        {
          item: "svetinje:favorites:v1",
          type: "localStorage — није колачић",
          purpose: "Настаје тек када корисник дода светињу у омиљено; чува низ стабилних ID-јева.",
          transfer: "Не шаље се серверу svetinje.me нити трећој страни.",
          duration: "До уклањања у интерфејсу или брисања података сајта у прегледачу.",
        },
        {
          item: "MapTiler / Cloudflare `_cfuvid`",
          type: "Могући технички колачић треће стране",
          purpose: "При захтјеву MapTiler ресурсима Cloudflare га може користити да разликује посјетиоце који дијеле исту IP адресу ради ограничавања броја захтјева и безбједности.",
          transfer: "Прегледач непосредно комуницира са MapTiler инфраструктуром. Стварно чување зависи од контекста прегледача и захтјева.",
          duration: "Трајање и стварна постојаност нијесу потврђени за јавни домен; контролише се подешавањима прегледача и пружаоца.",
        },
        {
          item: "Колачићи домена svetinje.me",
          type: "Тренутно нијесу пронађени",
          purpose: "Тренутни изворни код и техничка провјера нијесу открили сопствене аналитичке, огласне или колачиће за сагласност.",
          transfer: "Нема потврђеног слања колачића са домена svetinje.me.",
          duration: "Није примјенљиво; поново провјерити након јавног покретања.",
        },
      ],
    },
  },
  ru: {
    footer: {
      privacy: "Политика конфиденциальности",
      storage: "Cookies и локальное хранилище",
    },
    privacy: {
      eyebrow: "Правовая информация",
      title: "Политика конфиденциальности",
      description: "Как svetinje.me обрабатывает технические данные, использует инфраструктурные сервисы и хранит избранные святыни в браузере.",
      intro: "Эта политика описывает фактическую работу публичного сайта svetinje.me в его текущей реализации. На сайте нет пользовательских аккаунтов, публичных форм, рекламных пикселей и маркетингового профилирования.",
      updatedLabel: "Обновлено",
      updatedDate: "26 августа 2026 года",
      sections: [
        {
          heading: "Кто управляет сайтом и как с нами связаться",
          paragraphs: [
            "Публичным сайтом управляет проект svetinje.me. В опубликованной информации о проекте не указаны отдельное юридическое лицо, почтовый адрес, телефон или уполномоченный по защите данных.",
            "По вопросам конфиденциальности, доступа к данным или исправления материалов используйте опубликованный контакт проекта:",
          ],
          links: [{ label: "info@svetinje.me", href: "mailto:info@svetinje.me" }],
        },
        {
          heading: "Какие данные могут обрабатываться",
          paragraphs: ["При обычном HTTP-запросе инфраструктура получает ограниченные технические данные. Они нужны для доставки, безопасности и работы сайта, а не для создания пользовательского профиля."],
          bullets: [
            "IP-адрес, запрошенный URL, дата и время, метод и статус запроса;",
            "технические данные браузера и устройства, user-agent и referrer, если браузер их передаёт;",
            "сетевые и защитные метаданные для кэширования, предотвращения злоупотреблений и диагностики;",
            "ресурсы и участок карты, запрошенные у MapTiler; координаты области карты не являются GPS-геолокацией устройства;",
            "выбранная община или епархия, если их стабильный идентификатор присутствует в URL;",
            "адрес электронной почты и текст сообщения, только если вы сами напишете нам.",
          ],
        },
        {
          heading: "Цели и правовые основания",
          paragraphs: [
            "Технические данные используются для доставки и кэширования страниц и медиа, показа интерактивной карты, защиты инфраструктуры, устранения ошибок и ответа на добровольно отправленное письмо.",
            "В применимых случаях основанием служат необходимая техническая работа сервиса и законный интерес в надёжной и безопасной доставке запрошенного содержимого. Избранное сохраняется только после явного действия пользователя для запрошенной им функции. Согласие не заявляется основанием для обработки, для которой текущая версия сайта его не запрашивает.",
          ],
        },
        {
          heading: "Поставщики инфраструктуры",
          paragraphs: [
            "Cloudflare предоставляет хостинг, CDN, кэширование, сетевую и защитную инфраструктуру и поэтому может получать необходимые технические данные запросов.",
            "При загрузке интерактивной карты браузер напрямую запрашивает у MapTiler стили, тайлы, шрифты и другие картографические ресурсы. MapTiler может получить IP-адрес, запрошенные ресурсы, технические данные и сведения об источнике перехода в той мере, в какой их передаёт браузер. Техническая проверка не выявила отдельного рекламного трекера MapTiler.",
            "Точный договорный статус каждого поставщика, все места обработки и конфигурация панели управления не подтверждены, поэтому политика не делает более широких заявлений.",
          ],
          links: [
            { label: "Cloudflare Privacy Policy", href: cloudflarePrivacy },
            { label: "MapTiler Privacy Policy", href: mapTilerPrivacy },
          ],
        },
        {
          heading: "Избранные святыни",
          paragraphs: [
            "Избранные святыни хранятся только в localStorage браузера на устройстве пользователя. Сохраняются только стабильные идентификаторы объектов, которые пользователь добавил сам.",
            "Аккаунта нет, список не синхронизируется с сервером svetinje.me и не передаётся третьим лицам. Отдельную запись можно удалить в интерфейсе, а все локальные данные — через очистку данных сайта в браузере.",
          ],
        },
        {
          heading: "Фильтры, календарь и публичные медиа",
          paragraphs: [
            "Фильтры каталога по общине и епархии могут находиться в URL. Такой URL может сохраниться в истории браузера и обычных инфраструктурных журналах при запросе страницы; это не используется для профилирования.",
            "Календарь и евангельские чтения загружаются обычными GET-запросами к самому сайту. Публичные фотографии могут доставляться с media.svetinje.me через инфраструктуру Cloudflare.",
          ],
        },
        {
          heading: "Сроки хранения и международная обработка",
          paragraphs: [
            "Технические журналы хранятся не дольше, чем необходимо для соответствующей цели, с учётом фактических настроек и политики поставщика. Точный срок журналов Cloudflare не подтверждён и поэтому здесь не указывается.",
            "MapTiler сообщает, что IP-адреса конечных пользователей для проверок безопасности обрабатываются ограниченное время — до двух месяцев. Избранное остаётся в браузере, пока пользователь или браузер его не удалит.",
            "Cloudflare и MapTiler могут использовать инфраструктуру или поставщиков за пределами Черногории и Европейской экономической зоны в зависимости от договоров, настроек и субпоставщиков. Конкретные места и механизмы передачи необходимо повторно проверить для публичного домена.",
          ],
        },
        {
          heading: "Ваши права",
          paragraphs: [
            "В зависимости от применимого права и обстоятельств вы можете запросить информацию и доступ, исправление, удаление, ограничение обработки, заявить возражение и потребовать переносимость там, где она применима. Вы также вправе обратиться с жалобой в компетентный орган по защите данных.",
            "Поскольку избранное хранится локально и отсутствует на нашем сервере, проект не располагает его копией для выдачи или удаления; вы управляете им в своём браузере. По другим вопросам используйте опубликованный контакт.",
          ],
        },
        {
          heading: "Обязательность данных и автоматизированные решения",
          paragraphs: [
            "Вы не обязаны открывать сайт, пользоваться картой, добавлять избранное или отправлять письмо. Без базовых технических данных невозможно доставить запрошенную страницу или картографический ресурс.",
            "Текущая реализация не продаёт данные посетителей, не использует поведенческую рекламу, маркетинговое профилирование, рекламные пиксели или автоматизированные решения с юридическими либо аналогичными существенными последствиями.",
          ],
        },
        {
          heading: "Внешнее видео",
          paragraphs: [
            "Система поддерживает внешнее видео для записей, где оно предусмотрено, но в текущей публичной версии нет активного YouTube-видео. Если такой материал станет публичным, до публикации необходимо повторно оценить способ загрузки, правовое основание и дополнительные средства контроля. YouTube не представлен как получатель данных на каждой странице.",
          ],
        },
        {
          heading: "Изменения политики",
          paragraphs: [
            "Политика будет обновляться при изменении функций, инфраструктуры или правовых требований. После запуска домена svetinje.me необходима отдельная проверка cookies, локального хранилища, сетевых назначений и конфигурации Cloudflare в публичной версии.",
          ],
        },
      ],
    },
    storage: {
      eyebrow: "Конфиденциальность в браузере",
      title: "Cookies и локальное хранилище",
      description: "Какие cookies и локальное хранилище сейчас использует svetinje.me и как ими можно управлять.",
      intro: "Эта страница различает cookies, localStorage и хранилище внешнего поставщика. Перечень основан на текущем исходном коде и технической проверке, а не на универсальном шаблоне.",
      updatedLabel: "Обновлено",
      updatedDate: "26 августа 2026 года",
      sections: [
        {
          heading: "Cookie и localStorage — разные механизмы",
          paragraphs: [
            "Cookie — это данные, которые домен может сохранить в браузере и которые браузер при определённых условиях отправляет с HTTP-запросами. localStorage — локальное пространство браузера; его содержимое не отправляется серверу автоматически.",
            "Svetinje.me сейчас не устанавливает собственные аналитические или рекламные cookies. Это описание текущей реализации, а не обещание, что технологии никогда не изменятся.",
          ],
        },
        {
          heading: "Как управлять данными",
          paragraphs: ["Отдельную святыню можно удалить из избранного в интерфейсе. Все локальные данные удаляются через настройки браузера для данных сайта. Блокировка сторонних cookies может повлиять на технические механизмы MapTiler/Cloudflare, но основной контент отделён от списка избранного."],
        },
        {
          heading: "Почему нет баннера согласия",
          paragraphs: [
            "На текущем сайте нет дополнительного аналитического, рекламного или маркетингового хранилища, для которого предлагался бы выбор «принять все» или «отклонить все». Поэтому баннер и запись о согласии не добавлены.",
            "Окончательную оценку нужно повторить после запуска публичного домена svetinje.me, включая фактическое поведение MapTiler `_cfuvid` и настройки панели Cloudflare. Если появится дополнительная обработка, соответствующие средства управления будут добавлены до её включения.",
          ],
        },
        {
          heading: "Политики внешних поставщиков",
          paragraphs: ["Cloudflare и MapTiler публикуют собственную информацию о конфиденциальности и технических cookies. Их документы могут изменяться независимо от этого сайта."],
          links: [
            { label: "Cloudflare Cookies", href: cloudflareCookies },
            { label: "Cloudflare Privacy Policy", href: cloudflarePrivacy },
            { label: "MapTiler Privacy Policy", href: mapTilerPrivacy },
          ],
        },
      ],
      inventoryHeading: "Текущий перечень хранилища",
      inventoryIntro: "В перечень не добавлены вымышленные аналитические cookies. Указано только то, что подтверждено текущим исходным кодом или технической проверкой.",
      tableCaption: "Cookies и хранилище браузера, используемые или потенциально используемые публичным сайтом",
      headers: { item: "Название / поставщик", type: "Тип", purpose: "Когда и зачем", transfer: "Передача", duration: "Срок и управление" },
      rows: [
        {
          item: "svetinje:favorites:v1",
          type: "localStorage — не cookie",
          purpose: "Создаётся только после добавления святыни в избранное и хранит массив стабильных ID.",
          transfer: "Не передаётся серверу svetinje.me или третьим лицам.",
          duration: "До удаления в интерфейсе или очистки данных сайта в браузере.",
        },
        {
          item: "MapTiler / Cloudflare `_cfuvid`",
          type: "Возможный сторонний технический cookie",
          purpose: "При запросе ресурсов MapTiler Cloudflare может использовать его для различения посетителей с общим IP при ограничении частоты запросов и обеспечении безопасности.",
          transfer: "Браузер напрямую обращается к MapTiler. Фактическое сохранение зависит от контекста браузера и запроса.",
          duration: "Срок и фактическая устойчивость не подтверждены для публичного домена; управляются браузером и поставщиком.",
        },
        {
          item: "Cookies домена svetinje.me",
          type: "Сейчас не обнаружены",
          purpose: "Текущий исходный код и техническая проверка не выявили собственных аналитических, рекламных cookies или cookies согласия.",
          transfer: "Подтверждённой передачи cookies домена svetinje.me нет.",
          duration: "Не применимо; требуется повторная проверка после публичного запуска.",
        },
      ],
    },
  },
  en: {
    footer: {
      privacy: "Privacy Policy",
      storage: "Cookies & Local Storage",
    },
    privacy: {
      eyebrow: "Legal information",
      title: "Privacy Policy",
      description: "How svetinje.me handles technical data, uses infrastructure services, and stores favourite holy places in the browser.",
      intro: "This policy describes how the public svetinje.me site actually works in its current implementation. The site has no user accounts, public data-collection forms, advertising pixels, or marketing profiling.",
      updatedLabel: "Updated",
      updatedDate: "26 August 2026",
      sections: [
        {
          heading: "Who operates the site and how to contact us",
          paragraphs: [
            "The public website is operated by the svetinje.me project. The published project information does not name a separate legal entity, postal address, telephone number, or data protection officer.",
            "For privacy questions, data-access requests, or content corrections, use the project's published contact:",
          ],
          links: [{ label: "info@svetinje.me", href: "mailto:info@svetinje.me" }],
        },
        {
          heading: "Data that may be processed",
          paragraphs: ["A normal HTTP request necessarily exposes limited technical data to the infrastructure. It is used to deliver, secure, and operate the site, not to build a visitor profile."],
          bullets: [
            "IP address, requested URL, date and time, request method and status;",
            "browser and device technical data, user-agent, and referrer when the browser sends it;",
            "network and security metadata needed for caching, abuse prevention, and diagnostics;",
            "the resources and map area requested from MapTiler; map viewport coordinates are not the device's GPS location;",
            "the selected municipality or eparchy when its stable identifier is part of the URL;",
            "your email address and message only if you choose to email us.",
          ],
        },
        {
          heading: "Purposes and legal bases",
          paragraphs: [
            "Technical data is used to deliver and cache pages and media, show the interactive map, protect infrastructure, diagnose faults, and answer an email you choose to send.",
            "Where applicable, we rely on the technical necessity of operating the service and the legitimate interest in delivering requested content reliably and securely. Favourites are stored only after a clear user action for the feature they requested. Consent is not claimed as a legal basis for processing for which the current site does not ask for consent.",
          ],
        },
        {
          heading: "Infrastructure providers",
          paragraphs: [
            "Cloudflare provides hosting, CDN, caching, network, and security infrastructure. Cloudflare may therefore receive request metadata needed to provide those services.",
            "When the interactive map loads, the browser directly requests styles, tiles, fonts, and other map resources from MapTiler infrastructure. MapTiler may receive the IP address, requested resources, technical request data, and origin/referrer to the extent the browser sends them. The audit found no separate MapTiler advertising tracker.",
            "The exact contractual role of each provider, every processing location, and the Dashboard configuration have not been confirmed, so this policy does not make broader claims.",
          ],
          links: [
            { label: "Cloudflare Privacy Policy", href: cloudflarePrivacy },
            { label: "MapTiler Privacy Policy", href: mapTilerPrivacy },
          ],
        },
        {
          heading: "Favourite holy places",
          paragraphs: [
            "Favourite holy places are stored only in the browser's localStorage on the user's device. Only the stable IDs of places the user chose to add are stored.",
            "There is no user account, and the list is not synchronised with the svetinje.me server or sent to a third party. Individual items can be removed in the interface; all local data can be removed by clearing this site's data in the browser.",
          ],
        },
        {
          heading: "Filters, calendar, and public media",
          paragraphs: [
            "Catalogue municipality and eparchy filters may appear in the URL. That URL may remain in browser history and ordinary infrastructure logs when the page is requested; it is not used for profiling.",
            "Calendar and Gospel content is loaded through ordinary first-party GET requests. Public photographs may be served from media.svetinje.me through Cloudflare infrastructure.",
          ],
        },
        {
          heading: "Retention and international processing",
          paragraphs: [
            "Technical logs are retained no longer than needed for the relevant purpose, taking account of the provider's actual settings and policy. The exact Cloudflare log period has not been confirmed and is therefore not invented here.",
            "MapTiler states that it processes end-user IP addresses for security checks for a limited period of up to two months. Favourites remain in the browser until the user or browser removes them.",
            "Cloudflare and MapTiler may use infrastructure or suppliers outside Montenegro and the European Economic Area depending on contracts, configuration, and subprocessors. Exact locations and transfer safeguards must be rechecked for the production domain.",
          ],
        },
        {
          heading: "Your rights",
          paragraphs: [
            "Depending on applicable law and the circumstances, you may request information and access, correction, erasure, restriction, object to processing, and request portability where applicable. You may also complain to the competent data-protection authority.",
            "Because favourites are local and are not on our server, the project has no copy to provide or erase; you control them in your browser. Use the published contact for other requests.",
          ],
        },
        {
          heading: "Required data and automated decisions",
          paragraphs: [
            "You are not required to visit the site, use the map, add a favourite, or send an email. Without basic technical request data, the requested page or map resource cannot be delivered.",
            "The current implementation does not sell visitor data, use behavioural advertising, marketing profiling, advertising pixels, or automated decisions producing legal or similarly significant effects.",
          ],
        },
        {
          heading: "External video",
          paragraphs: [
            "The system supports external video for records that provide one, but the current public production output contains no active YouTube video. If such content becomes public, the loading method, legal basis, and need for additional privacy controls must be reassessed before publication. YouTube is not presented as receiving data on every page.",
          ],
        },
        {
          heading: "Policy changes",
          paragraphs: [
            "We will update this policy when functionality, infrastructure, or legal requirements change. A separate production check of cookies, storage, network origins, and Cloudflare configuration is required after the svetinje.me domain launches.",
          ],
        },
      ],
    },
    storage: {
      eyebrow: "Browser privacy",
      title: "Cookies & Local Storage",
      description: "Which cookies and local storage svetinje.me currently uses and how visitors can control them.",
      intro: "This page distinguishes cookies, localStorage, and storage that may be used by an external provider. The inventory comes from the current source and technical audit, not a generic cookie template.",
      updatedLabel: "Updated",
      updatedDate: "26 August 2026",
      sections: [
        {
          heading: "Cookies and localStorage are different",
          paragraphs: [
            "A cookie is data a domain may store in the browser and that the browser may send with HTTP requests under the applicable rules. localStorage is browser storage; its content is not automatically sent to a server.",
            "Svetinje.me currently sets no first-party analytics or advertising cookies. This describes the current implementation and is not a promise that technology will never change.",
          ],
        },
        {
          heading: "How to manage stored data",
          paragraphs: ["You can remove individual favourite holy places in the interface. You can remove all local data through the browser's site-data settings. Blocking third-party cookies may affect MapTiler/Cloudflare technical mechanisms, but the site's core content remains separate from the favourites list."],
        },
        {
          heading: "Why there is no consent banner",
          paragraphs: [
            "The current site has no optional analytics, advertising, or marketing storage for which it would offer an “accept all” or “reject all” choice. No banner or consent state has therefore been added.",
            "The final assessment must be repeated after the svetinje.me production domain launches, including the actual behaviour of MapTiler's `_cfuvid` cookie and the Cloudflare Dashboard configuration. If optional processing is introduced, suitable controls will be added before it is enabled.",
          ],
        },
        {
          heading: "External provider policies",
          paragraphs: ["Cloudflare and MapTiler publish their own information about privacy and technical cookies. Their documents may change independently of this site."],
          links: [
            { label: "Cloudflare Cookies", href: cloudflareCookies },
            { label: "Cloudflare Privacy Policy", href: cloudflarePrivacy },
            { label: "MapTiler Privacy Policy", href: mapTilerPrivacy },
          ],
        },
      ],
      inventoryHeading: "Current storage inventory",
      inventoryIntro: "The inventory does not add imaginary analytics cookies. It lists only behaviour confirmed in the current source or audit.",
      tableCaption: "Cookies and browser storage used or potentially used by the public site",
      headers: { item: "Name / provider", type: "Type", purpose: "When and why", transfer: "Transmission", duration: "Duration and control" },
      rows: [
        {
          item: "svetinje:favorites:v1",
          type: "localStorage — not a cookie",
          purpose: "Created only after a user adds a favourite; stores an array of stable place IDs.",
          transfer: "Not sent to the svetinje.me server or any third party.",
          duration: "Until removed in the interface or the site's data is cleared in the browser.",
        },
        {
          item: "MapTiler / Cloudflare `_cfuvid`",
          type: "Possible third-party technical cookie",
          purpose: "When MapTiler resources are requested, Cloudflare may use it to distinguish visitors sharing one IP address for rate limiting and security.",
          transfer: "The browser connects directly to MapTiler infrastructure. Actual storage depends on the browser/request context.",
          duration: "Duration and actual persistence are not confirmed for the production domain; controlled by browser and provider settings.",
        },
        {
          item: "Svetinje.me first-party cookies",
          type: "None currently found",
          purpose: "The current source and audit found no first-party analytics, advertising, or consent cookies.",
          transfer: "No confirmed first-party cookie transmission.",
          duration: "Not applicable; recheck after the production launch.",
        },
      ],
    },
  },
} as const satisfies Record<Locale, LegalLocaleCopy>;
