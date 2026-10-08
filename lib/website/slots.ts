// Every spot on the public site that Settings → Website can change, with the
// words, pictures, buttons or lists the page shows until someone does. Pages
// read a spot with getSiteContent() (./queries.ts); a spot nobody has edited
// shows its default, so a new spot changes nothing until it's edited.
//
// To make another spot editable: add it here, then read it on the page in
// place of what's written there. Keep the default identical to what the page
// showed, so the page looks the same until it's edited.
// Safe to import from client components.

import type { StaticImageData } from "next/image";
import homeBasketball from "../../app/(site)/_images/home-basketball.jpg";
import philosophyNet from "../../app/(site)/_images/philosophy-net.jpg";
import historyNet from "../../app/(site)/_images/history-net.jpg";
import summerFlyer from "../../app/(site)/_images/summer-clinic-flyer.jpg";
import coachCatherine from "../../app/(site)/_images/coach-catherine-goeller.jpg";
import coachCory from "../../app/(site)/_images/coach-cory-eikmeier.jpg";
import coachCourtney from "../../app/(site)/_images/coach-courtney-kidd.jpg";
import coachJay from "../../app/(site)/_images/coach-jay-mancuso.jpg";
import coachJerod from "../../app/(site)/_images/coach-jerod-santo.jpg";
import coachKevin from "../../app/(site)/_images/coach-kevin-johnson.jpg";
import coachMicah from "../../app/(site)/_images/coach-micah-nelson.jpg";
import coachMike from "../../app/(site)/_images/coach-mike-staffenbeal.jpg";
import coachPhil from "../../app/(site)/_images/coach-phil-friesen.jpg";
import coachRodney from "../../app/(site)/_images/coach-rodney-wyatt.jpg";
import sponsorConverge from "../../app/(site)/_images/sponsor-converge-church.png";
import sponsorGrainworx from "../../app/(site)/_images/sponsor-grainworx.png";
import sponsorKrave from "../../app/(site)/_images/sponsor-krave-gym.jpg";
import sponsorMillard from "../../app/(site)/_images/sponsor-millard-community-church.png";
import sponsorNelson from "../../app/(site)/_images/sponsor-nelson-produce-farm.jpg";
import sponsorTruthAndBeauty from "../../app/(site)/_images/sponsor-truth-and-beauty.png";
import type { LinkValue, ListField, ListItem, SlotKind } from "./content";

// The site's own pictures that list items can point at ({ builtin: id }).
export const BUILTIN_IMAGES: Record<string, StaticImageData> = {
  "coach-catherine-goeller": coachCatherine,
  "coach-cory-eikmeier": coachCory,
  "coach-courtney-kidd": coachCourtney,
  "coach-jay-mancuso": coachJay,
  "coach-jerod-santo": coachJerod,
  "coach-kevin-johnson": coachKevin,
  "coach-micah-nelson": coachMicah,
  "coach-mike-staffenbeal": coachMike,
  "coach-phil-friesen": coachPhil,
  "coach-rodney-wyatt": coachRodney,
  "sponsor-converge-church": sponsorConverge,
  "sponsor-grainworx": sponsorGrainworx,
  "sponsor-krave-gym": sponsorKrave,
  "sponsor-millard-community-church": sponsorMillard,
  "sponsor-nelson-produce-farm": sponsorNelson,
  "sponsor-truth-and-beauty": sponsorTruthAndBeauty,
};
export const BUILTIN_IMAGE_IDS = Object.keys(BUILTIN_IMAGES);

// Where each page group lives, for "Open this page on the site".
export const PAGE_PATHS: Record<string, string> = {
  Home: "/",
  Philosophy: "/philosophy",
  History: "/history",
  Summer: "/summer",
  Programs: "/programs",
  Coaches: "/coaches",
  Sponsors: "/sponsors",
  "Footer (every page)": "/",
};

interface SlotBase {
  key: string;
  // Which page it's on, as the editor groups them.
  page: string;
  // What the spot is, in the editor.
  label: string;
  // A hint under the field.
  help?: string;
}

export interface TextSlot extends SlotBase {
  kind: "text";
  default: string;
  // Allow line breaks (a text box rather than a one-line field).
  multiline?: boolean;
  max: number;
}

export interface MarkdownSlot extends SlotBase {
  kind: "markdown";
  default: string;
}

export interface ImageSlot extends SlotBase {
  kind: "image";
  default: StaticImageData;
  defaultAlt: string;
}

export interface LinkSlot extends SlotBase {
  kind: "link";
  default: LinkValue;
  // Longest the button's words may be.
  max: number;
}

export interface ListSlot extends SlotBase {
  kind: "list";
  // What one item is called: "coach", "program".
  itemName: string;
  max: number;
  fields: readonly ListField[];
  default: readonly ListItem[];
}

export type SiteSlot = TextSlot | MarkdownSlot | ImageSlot | LinkSlot | ListSlot;

export const SITE_SLOTS = [
  // ─── Home ───────────────────────────────────────────────────────────────
  {
    key: "home.welcome.title",
    page: "Home",
    label: "Welcome heading",
    kind: "text",
    max: 120,
    default: "Welcome to Omaha Lightning Basketball!",
  },
  {
    key: "home.welcome.body",
    page: "Home",
    label: "Welcome message",
    kind: "markdown",
    default:
      "For over two decades, Omaha Lightning Basketball has served to create an opportunity for home school athletes from all over the Omaha metro and surrounding areas to experience the challenge, enjoyment, and personal development opportunities that competitive basketball can offer. Most importantly though, our goal is to provide these experiences in a Christian environment where young boys have the opportunity to grow into Godly Christian men. To learn more about the Lightning philosophy click [HERE](/philosophy).",
  },
  {
    key: "home.photo",
    page: "Home",
    label: "Main photo",
    help: "Beside Purpose, Mission and Vision. Cropped to fit, so keep the subject near the middle.",
    kind: "image",
    default: homeBasketball,
    defaultAlt: "A basketball on the court at players' feet",
  },
  {
    key: "home.purpose",
    page: "Home",
    label: "Purpose",
    kind: "text",
    multiline: true,
    max: 1000,
    default:
      "Omaha Lightning Basketball exists to provide home educated boys the opportunity to participate in an organized competitive basketball program that has a distinctly Christian character.",
  },
  {
    key: "home.mission",
    page: "Home",
    label: "Mission",
    kind: "text",
    multiline: true,
    max: 1000,
    default:
      "Provide an enriching environment that challenges players to mature physically, emotionally, and spiritually, thereby growing in grace, and in the knowledge of our Lord and Savior Jesus Christ.",
  },
  {
    key: "home.vision",
    page: "Home",
    label: "Vision",
    kind: "text",
    multiline: true,
    max: 1000,
    default:
      "That students develop into mature Christian adults who serve their families, churches, and communities according to the ideals espoused in Colossians 3:17; “And whatever you do in word or deed, do all in the name of the Lord Jesus, giving thanks to God the Father through Him.”",
  },

  // ─── Philosophy ─────────────────────────────────────────────────────────
  {
    key: "philosophy.title",
    page: "Philosophy",
    label: "Heading",
    kind: "text",
    max: 80,
    default: "Philosophy.",
  },
  {
    key: "philosophy.banner",
    page: "Philosophy",
    label: "Banner picture",
    help: "Behind the heading, faded with a white wash and cropped to the banner's shape.",
    kind: "image",
    default: philosophyNet,
    defaultAlt: "",
  },
  {
    key: "philosophy.body",
    page: "Philosophy",
    label: "Page text",
    kind: "markdown",
    default: `For over two decades, Omaha Lightning Basketball has served to create an opportunity for home school athletes from all over the Omaha metro and surrounding areas to experience the challenge, enjoyment, and personal development opportunities that competitive basketball can offer. Most importantly though, our goal is to provide these experiences in a Christian environment where young boys have the opportunity to grow into Godly Christian men. To that end, Omaha Lightning Basketball is devoted to THREE GUIDING PRINCIPLES...

**-God-**

Above all else, we strive to use the experiences players encounter while practicing and playing the sport of basketball to teach our players Christ like character. We believe the situations players experience on the court emulate experiences they will face as they enter their adult lives. We seek to use these experiences as teaching tools to help players learn to respond in a way that glorifies Christ.

**-Family-**

Secondly, as players condition, practice, compete, win and lose together, we work to create a strong sense of community. Our goal is for players to build meaningful, positive relationships that will carry them through the challenges that occur during adolescent and teenage years. Through trial and victory, players learn and experience what it means to be a family and their responsibilities to that family.

**-Basketball-**

Lastly, we strive to provide a setting where home school students can achieve their full athletic potential. No matter the players skill level or previous basketball experiences, we set high expectation to continually improve. Through conditioning, practicing and game experiences, skilled coaches and the entire Omaha Lightning family encourage and help each player improve toward being the best athlete they can be.`,
  },

  // ─── History ────────────────────────────────────────────────────────────
  {
    key: "history.title",
    page: "History",
    label: "Heading",
    kind: "text",
    max: 80,
    default: "History.",
  },
  {
    key: "history.body",
    page: "History",
    label: "Page text",
    kind: "markdown",
    default: "The Lightning Story…\n\ncoming soon!",
  },
  {
    key: "history.background",
    page: "History",
    label: "Background picture",
    help: "Fills the page behind the text, faded with a white wash.",
    kind: "image",
    default: historyNet,
    defaultAlt: "",
  },

  // ─── Summer ─────────────────────────────────────────────────────────────
  {
    key: "summer.title",
    page: "Summer",
    label: "Heading",
    kind: "text",
    max: 80,
    default: "SUMMER 2026 CLINICS",
  },
  {
    key: "summer.status",
    page: "Summer",
    label: "Status line",
    help: "The red line under the heading, like WAITLISTED! or OPEN NOW!",
    kind: "text",
    max: 60,
    default: "WAITLISTED!",
  },
  {
    key: "summer.flyer",
    page: "Summer",
    label: "Flyer",
    help: "Shown whole, never cropped.",
    kind: "image",
    default: summerFlyer,
    defaultAlt:
      "Omaha Lightning's Summer Heat basketball clinics: 8 sessions for $60, July and August, ages 7-18, T-shirt included",
  },

  // ─── Programs ───────────────────────────────────────────────────────────
  {
    key: "programs.intro.lead",
    page: "Programs",
    label: "Opening line",
    kind: "text",
    max: 200,
    default: "With 8 competitive teams, strength training & summer clinics…",
  },
  {
    key: "programs.intro.title",
    page: "Programs",
    label: "Headline",
    kind: "text",
    max: 200,
    default: "Lightning Basketball has a program for everyone. Find yours below!",
  },
  {
    key: "programs.notice",
    page: "Programs",
    label: "Notice box",
    help: "The black box under the headline: waitlists, deadlines.",
    kind: "text",
    multiline: true,
    max: 400,
    default: "8U-14U are currently waitlisted for the 2026-27 Season. Please register below.  We will reach out if space allows.",
  },
  {
    key: "programs.heading",
    page: "Programs",
    label: "Programs heading",
    kind: "text",
    max: 80,
    default: "Our Programs",
  },
  {
    key: "programs.list",
    page: "Programs",
    label: "Programs",
    help: "Each one opens to show its details when someone taps its name.",
    kind: "list",
    itemName: "program",
    max: 12,
    fields: [
      { name: "title", label: "Name", type: "text", required: true, max: 120 },
      { name: "body", label: "Details", type: "markdown", required: true },
    ],
    default: [
      { title: "8U-12U Competitive (Waitlisted)", body: `Our elementary competitive program is extremely popular and fills fast because of our amazing coaching staff and community. Our grade school program focuses on developing each individual player with fundamentals and sportsmanship while creating friendships through a common goal.

-Season starts first week in October and runs through February with a mid-December break.

- **Two practices per week (90-120 min each)**

- **15-20 games per season**

- **Practices:**

  **Tuesday:**
  **10u, 5-7pm @ St. Mark’s**
  **12u, 6-8pm @ St. Mark’s**
  **( 1812 N. 90th St.)**

- **Thursday:**
  **3-5pm @ UBT South**

-Compete in the Conqueror basketball league FALL & WINTER sessions. (games start second weekend in Oct.)

-Will compete at the NCHC Regional Tournament in Lawrence, KS, Feb. 24-27, 2027.

-4 qualified, Christian, volunteer coaches dedicated to investing in our elementary age group at every practice.

**Registration fee: $375**` },
      { title: "14U Competitive (Waitlisted)", body: `Our 14U competitive program is extremely popular and fills fast because of our amazing coaching staff and community. The 14U program focuses on developing each individual player while preparing them to compete at the High School level. These athletes will grow in sportsmanship, skill, athleticism, friendship, and a love for hard work as they strive for common goals in basketball and life.

-Season starts in October and runs through February with a mid-December break.

- **Two practices per week:**

  **Monday 4-6pm @ Creighton**

  **Thursday 5:30-7:30pm @ St. Mark's OR 6:30-8:30pm @ Papillion Landing**

- **25-30 games per season**

-Compete in the Conqueror Basketball League FALL & WINTER

-14U Teams play in additional '“day trip” homeschool tournaments and an early season overnight tournament in Des Moines.

-14U teams will also compete at the NCHC Homeschool Regional Tournament in Wichita, KS Feb. 24-27nd, 2027.

**Registration fee: $400**` },
      { title: "16U-18U Competitive", body: `As a competitive high school program, players on our 16u and 18u teams are encouraged to solidify their fundamental basketball skills, physical conditioning, and team skills necessary to compete against other home school organizations throughout the Midwest. (*Travel is required at this level.)*

-Practices begin in October and run through mid March with games beginning in November.

- **25-35 games per season**

* **3-6 out of town tournaments**

* **Two practices per week:**

  **Monday 4-6pm @ Creighton**
  **Thursday 6:30-8:30pm @ Papillion Landing**

* Compete in the Regional/National tournament (NCHC Regionals/Nationals, or NDII Tournament) in late February/early March.

**Registration Fee: $525**` },
    ],
  },
  {
    key: "programs.button.waitlist",
    page: "Programs",
    label: "First button",
    kind: "link",
    max: 120,
    default: {
      label: "CLICK HERE TO JOIN THE WAITLIST FOR THE 8U-14U SEASON!",
      href: "https://www.cognitoforms.com/OmahaLightningBasketball1/_10u14uCompetitiveWaitlist",
    },
  },
  {
    key: "programs.button.assessments",
    page: "Programs",
    label: "Second button",
    kind: "link",
    max: 120,
    default: {
      label: "CLICK HERE TO REGISTER FOR HIGH SCHOOL ASSESMENTS",
      href: "https://www.cognitoforms.com/OmahaLightningBasketball1/OmahaLightningHighSchoolAssessments2026",
    },
  },
  {
    key: "programs.button.register",
    page: "Programs",
    label: "Third button",
    help: "The season registration for families already in the program goes to /player-registration.",
    kind: "link",
    max: 120,
    default: {
      label: "CLICK HERE TO REGISTER A CURRENT PLAYER OR SIBLING FOR 2026-27",
      href: "/player-registration",
    },
  },

  // ─── Coaches ────────────────────────────────────────────────────────────
  {
    key: "coaches.title",
    page: "Coaches",
    label: "Heading",
    kind: "text",
    max: 80,
    default: "Our Coaches",
  },
  {
    key: "coaches.list",
    page: "Coaches",
    label: "Coaches",
    help: "Changing this list lays the coaches out in two even columns, rather than the original staggered layout.",
    kind: "list",
    itemName: "coach",
    max: 40,
    fields: [
      { name: "name", label: "Name", type: "text", required: true, max: 80 },
      { name: "role", label: "Role", type: "text", max: 120, help: "Under the name in italics, like 14U Head Coach." },
      { name: "photo", label: "Photo", type: "image", required: true, help: "Shown as an oval, cropped to fit." },
      { name: "bio", label: "Bio", type: "markdown" },
    ],
    default: [
      {
        name: "Mike Staffenbeal",
        role: "16U/18U Coach",
        photo: { builtin: "coach-mike-staffenbeal", alt: "Mike Staffenbeal" },
        bio: "Coach Mike is entering his 14th season as a Lightning Basketball coach, with over 400 games of head coach experience throughout all levels of the Lightning program. Mike's high school teams have achieved both team success, with consistent top half finishes in the Division I National Homeschool Basketball Tournament, as well as individual success, with several all-tournament team and most valuable player selections... But most importantly, Coach Mike is incredibly proud of the teamwork, character, integrity and growth in the scriptures of all of the players he has had the pleasure of coaching in the Lightning organization! Mike is recently retired as a Finance Executive from a Fortune 200 company and now has time to spend helping Nebraska entrepreneurs be successful in their endeavors, while still finding time to enjoy hunting, fishing and teaching the scriptures.",
      },
      {
        name: "Cory Eikmeier",
        role: "16U/18U Coach",
        photo: { builtin: "coach-cory-eikmeier", alt: "Cory Eikmeier" },
        bio: "Coach Cory has been coaching youth sports for over a decade. Cory's belief in the Lord Jesus Christ and his faith are the foundations of his coaching style... he expects that his players display character, attitude and actions that are respectful to their coaches, teammates, referees and others... but most of all, honoring to the Lord. Cory and his wife Erica have been blessed with six children (4 boys, 2 girls) and he has been a coach for Lightning Basketball for the past four years. Coaching is a true passion for Cory! His goal in coaching is to use the environment of youth sports to train and prepare youth for the game of life.",
      },
      {
        name: "Jay Mancuso",
        role: "14U Head Coach",
        photo: { builtin: "coach-jay-mancuso", alt: "Jay Mancuso" },
        bio: "Coach Jay's involvement in the Lightning organization literally spans almost his entire life! Jay began his time with Lightning Basketball as a young grade school player, working to develop his basic basketball fundamental playing skills. He continued to play for Lightning through Junior High and High School, becoming an extremely accurate shooter, while participating in several National Homeschool Basketball Tournament game experiences and developing life-long friendships with his teammates in the process. Holding true to the Lightning Philosophy, Jay began giving back to the Lightning program after graduating by becoming an assistant coach. Transitioning from a player role to a coaching role within the Lightning program afforded Jay a unique perspective that has driven him to \"pass on\" both the life and basketball lessons he learned as a Lightning player to the players he now coaches.",
      },
      {
        name: "Courtney Kidd",
        role: "14U Head Coach",
        photo: { builtin: "coach-courtney-kidd", alt: "Courtney Kidd" },
        bio: "Basketball has been a part of Coach Courtney's life since the age of 8. He played basketball for Omaha Northwest and Omaha Bryan High Schools as a teenager, and then for Peru State College. Coach Courtney has also coached for the Omaha Boys and Girls Club, YMCA, and was an assistant coach at Peru State for camp and fundamentals programs. Coach Courtney strives to encourage his players through positive reinforcement with a goal of empowering every player to be confident in their abilities so they can perform at their highest level.",
      },
      {
        name: "Jerod Santo",
        role: "12U Head Coach",
        photo: { builtin: "coach-jerod-santo", alt: "Jerod Santo" },
        bio: "Coach Jerod is a father of six children, three of which are playing Lightning Basketball this season. Coach Jerod also coached his sons' EAA baseball team for the past five years. In addition to coaching, he regularly teaches Bible class at his church and at his home. Jerod is also the owner of an independent media company for software developers and still finds time to play pickup basketball a few times a week!",
      },
      {
        name: "Kevin Johnson",
        role: "10U Head Coach",
        photo: { builtin: "coach-kevin-johnson", alt: "Kevin Johnson" },
        bio: "Coach Kevin was an active basketball player from an early age through high school. He has coached numerous soccer, baseball, football and basketball teams that his four sons have been a part of over the years. He finds coaching to be a great way to spend quality time with this sons, helping them develop as players, but more importantly, as men on their journey with Christ. He finds coaching basketball to be a great way to continue investing in others. Kevin spent ten years as a pastor and has a passion for helping people take their next steps- whatever those steps may be.",
      },
      {
        name: "Catherine Goeller",
        role: "10U/12U Assistant Coach",
        photo: { builtin: "coach-catherine-goeller", alt: "Catherine Goeller" },
        bio: "Catherine Goeller has been involved with basketball for the majority of her life, playing for national powerhouse St. John Vianney High School in NJ, and both the United States Naval Academy and Longwood University at the NCAA Division 1 level.\n\nCatherine began coaching basketball at the age of 18, instructing players at summer camps and in private sessions. Her coaching experience includes coaching girls basketball at the HS level in VA and CT, and women’s lacrosse at the NCAA Division 3 level. Catherine began coaching with Omaha Lightning in 2025, alongside her three sons. She enjoys the positive, encouraging, competitive, and faith focused community that Omaha Lightning provides for the players, coaches, and families alike. In addition to coaching, she also really enjoys cheering all of the Lightning teams on from the sidelines!\n\nCatherine is a native of NJ, and has been transplanted in NE by her husband, Jason’s, military orders. Jason has been serving in the US Navy for almost 20 years. Together, they have been blessed with three precious sons, who truly enjoy being a part of Omaha Lightning Basketball.",
      },
      {
        name: "Micah Nelson",
        role: "12U Head Coach",
        photo: { builtin: "coach-micah-nelson", alt: "Micah Nelson" },
        bio: "My name is Micah Nelson, I am the father of three children. Two boys and a girl. I have loved coaching all three of my children in flag football, baseball, and basketball through the years. I enjoy the time to invest in my own kids and be able to have a positive influence on many other kids. I’m thankful to have been able to coach and have built some great relationships through it. My passion in coaching is helping kids learn more about the sport while also teaching them character and good sportsmanship, but most importantly about the Lord. As a coach I feel like there is always new ways to grow and learn along side the kids.",
      },
      {
        name: "Phil Friesen",
        role: "10U Coach",
        photo: { builtin: "coach-phil-friesen", alt: "Phil Friesen" },
        bio: "Phil Friesen had the joy of playing for Omaha Lightning in high school, and then returning to coach in the elementary program a decade ago for an handful of years, and is now back, coaching again. Phil enjoys watching how quickly the boys develop new skills, how many practical applications to life that basketball offers, as well as how basketball enables the athletes to grow in their walk with the Lord. Phil and his wife, Katie, have two kids and he greatly enjoys how family oriented the Lightning program is!",
      },
      {
        name: "Rodney Wyatt",
        role: "Temporarily relocated in service of our country.",
        photo: { builtin: "coach-rodney-wyatt", alt: "Rodney Wyatt" },
        bio: "Coach Rodney's experience with basketball is extensive. He was a MCSAA High School Varsity Missouri State Basketball Champion as a high school student. He then moved on to play basketball for Maranatha Bible Baptist College and Ottawa University. His coaching experiences include being the assistant high school coach for Tri-Baptist HS, head coach for numerous Air Force base teams at places like Whiteman Air Force Base in Kansas and Aviano Air Force Base in Italy, and a youth basketball and baseball coach here in Omaha. He is also a National Alliance of Youth Sports member. Coach Rodney's primary goal as a coach is to build camaraderie and character through challenges and competition, while emphasizing that every member of the team deserves to be treated with encouragement and respect.",
      },
    ],
  },
  {
    key: "coaches.note",
    page: "Coaches",
    label: "Note after the coaches",
    kind: "markdown",
    default: "**NEW Coaches joining lightning for the 2026-27 season!**\n\n**-Thomas Rehm**\n\n**-Chris Woodhouse**",
  },

  // ─── Sponsors ───────────────────────────────────────────────────────────
  {
    key: "sponsors.intro",
    page: "Sponsors",
    label: "Headline",
    kind: "text",
    multiline: true,
    max: 400,
    default:
      "By becoming an Omaha Lightning Basketball sponsor, you help provide the Omaha homeschool community with enriching opportunities in sports and life.",
  },
  {
    key: "sponsors.button.become",
    page: "Sponsors",
    label: "First button",
    kind: "link",
    max: 40,
    default: { label: "Become A Sponsor", href: "/contact" },
  },
  {
    key: "sponsors.button.donate",
    page: "Sponsors",
    label: "Second button",
    kind: "link",
    max: 40,
    default: { label: "Donate", href: "https://account.venmo.com/u/OmahaLightning-Basketball" },
  },
  {
    key: "sponsors.list",
    page: "Sponsors",
    label: "Sponsors",
    help: "Their logos, in two columns. A logo with a web address opens it in a new tab.",
    kind: "list",
    itemName: "sponsor",
    max: 40,
    fields: [
      { name: "name", label: "Name", type: "text", required: true, max: 120 },
      { name: "logo", label: "Logo", type: "image", required: true },
      { name: "link", label: "Web address", type: "url" },
    ],
    default: [
      { name: "Krave Gym", logo: { builtin: "sponsor-krave-gym", alt: "" }, link: "https://elkhorn.kravegym.com" },
      { name: "Nelson Produce + Farm", logo: { builtin: "sponsor-nelson-produce-farm", alt: "" }, link: "https://www.nelsonproducefarm.com" },
      { name: "GrainWorx", logo: { builtin: "sponsor-grainworx", alt: "" }, link: "https://www.rsdico.com/grainworx-features" },
      { name: "Converge Church", logo: { builtin: "sponsor-converge-church", alt: "" }, link: "https://www.convergechurchomaha.org" },
      { name: "Millard Community Church", logo: { builtin: "sponsor-millard-community-church", alt: "" }, link: "https://www.millardcommunitychurch.com" },
      {
        name: "Truth & Beauty Homeschool Collaborative",
        logo: { builtin: "sponsor-truth-and-beauty", alt: "" },
        link: "https://truthandbeautyhomeschoolcollaborative.com",
      },
    ],
  },

  // ─── Footer (every page) ────────────────────────────────────────────────
  {
    key: "footer.verse",
    page: "Footer (every page)",
    label: "Verse",
    kind: "markdown",
    default: "*“And whatever you do, do it heartily, as to the Lord and not to men.”* Col 3:23",
  },
  {
    key: "footer.tagline",
    page: "Footer (every page)",
    label: "Tagline",
    kind: "text",
    max: 200,
    default: "A volunteer-run program that supports and advances homeschool sports in Omaha, Nebraska",
  },

  // ─── New pages ──────────────────────────────────────────────────────────
  {
    key: "pages.list",
    page: "New pages",
    label: "New pages",
    help: "Pages of your own, each at its own address. Add one to the menu to link to it.",
    kind: "list",
    itemName: "page",
    max: 30,
    fields: [
      { name: "title", label: "Title", type: "text", required: true, max: 80 },
      { name: "slug", label: "Address", type: "slug", required: true, help: "The end of the page's web address: fall-camp makes /fall-camp." },
      { name: "banner", label: "Banner picture", type: "image", help: "Optional. Shown behind the title, faded." },
      { name: "body", label: "Page text", type: "markdown", required: true },
    ],
    default: [],
  },
] as const satisfies readonly SiteSlot[];

type Slots = (typeof SITE_SLOTS)[number];
export type SlotKey = Slots["key"];
export type TextSlotKey = Extract<Slots, { kind: "text" | "markdown" }>["key"];
export type ImageSlotKey = Extract<Slots, { kind: "image" }>["key"];
export type LinkSlotKey = Extract<Slots, { kind: "link" }>["key"];
export type ListSlotKey = Extract<Slots, { kind: "list" }>["key"];

const BY_KEY = new Map<string, SiteSlot>((SITE_SLOTS as readonly SiteSlot[]).map((s) => [s.key, s]));

export function findSlot(key: string): SiteSlot | null {
  return BY_KEY.get(key) ?? null;
}

export function slotKindOf(key: string): SlotKind | null {
  return BY_KEY.get(key)?.kind ?? null;
}
