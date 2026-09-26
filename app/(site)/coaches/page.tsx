import type { Metadata } from "next";
import type { StaticImageData } from "next/image";
import catherine from "../_images/coach-catherine-goeller.jpg";
import cory from "../_images/coach-cory-eikmeier.jpg";
import courtney from "../_images/coach-courtney-kidd.jpg";
import jay from "../_images/coach-jay-mancuso.jpg";
import jerod from "../_images/coach-jerod-santo.jpg";
import kevin from "../_images/coach-kevin-johnson.jpg";
import micah from "../_images/coach-micah-nelson.jpg";
import mike from "../_images/coach-mike-staffenbeal.jpg";
import phil from "../_images/coach-phil-friesen.jpg";
import rodney from "../_images/coach-rodney-wyatt.jpg";
import { Picture } from "../_components/Picture";
import { Block, Section } from "../_components/Section";
import { Small, Text } from "../_components/Text";

export const metadata: Metadata = { title: "Coaches" };

type Coach = {
  name: string;
  photo: StaticImageData;
  focus?: string;
  // What follows the name: a role line, or a note.
  intro: React.ReactNode;
  bio: React.ReactNode;
  // [phone, desktop] grid areas for the portrait, the name and the bio.
  at: { photo: [string, string]; name: [string, string]; bio: [string, string] };
};

const role = (text: string) => (
  <Small>
    <em>{text}</em>
  </Small>
);

const COACHES: Coach[] = [
  {
    name: "Mike Staffenbeal",
    photo: mike,
    focus: "26.7% 35.5%",
    intro: role("16U/18U Coach"),
    bio: (
      <p>
        Coach Mike is entering his 14th season as a Lightning Basketball coach, with over 400 games of head coach
        experience throughout all levels of the Lightning program. Mike&apos;s high school teams have achieved both team
        success, with consistent top half finishes in the Division I National Homeschool Basketball Tournament, as well
        as individual success, with several all-tournament team and most valuable player selections... But most
        importantly, Coach Mike is incredibly proud of the teamwork, character, integrity and growth in the scriptures
        of all of the players he has had the pleasure of coaching in the Lightning organization! Mike is recently
        retired as a Finance Executive from a Fortune 200 company and now has time to spend helping Nebraska
        entrepreneurs be successful in their endeavors, while still finding time to enjoy hunting, fishing and teaching
        the scriptures.{" "}
      </p>
    ),
    at: { photo: ["2/6/8/10", "2/9/9/13"], name: ["2/2/7/6", "3/4/6/9"], bio: ["8/2/28/10", "9/4/22/13"] },
  },
  {
    name: "Cory Eikmeier",
    photo: cory,
    intro: role("16U/18U Coach"),
    bio: (
      <p>
        Coach Cory has been coaching youth sports for over a decade. Cory&apos;s belief in the Lord Jesus Christ and his
        faith are the foundations of his coaching style... he expects that his players display character, attitude and
        actions that are respectful to their coaches, teammates, referees and others... but most of all, honoring to
        the Lord. Cory and his wife Erica have been blessed with six children (4 boys, 2 girls) and he has been a coach
        for Lightning Basketball for the past four years. Coaching is a true passion for Cory! His goal in coaching is
        to use the environment of youth sports to train and prepare youth for the game of life.
      </p>
    ),
    at: { photo: ["28/6/34/10", "2/20/9/24"], name: ["29/2/32/6", "3/15/6/20"], bio: ["34/2/49/10", "9/15/18/24"] },
  },
  {
    name: "Jay Mancuso",
    photo: jay,
    intro: (
      <>
        {role("14U Head Coach")}
        <Small />
      </>
    ),
    bio: (
      <p>
        Coach Jay&apos;s involvement in the Lightning organization literally spans almost his entire life! Jay began his
        time with Lightning Basketball as a young grade school player, working to develop his basic basketball
        fundamental playing skills. He continued to play for Lightning through Junior High and High School, becoming an
        extremely accurate shooter, while participating in several National Homeschool Basketball Tournament game
        experiences and developing life-long friendships with his teammates in the process. Holding true to the
        Lightning Philosophy, Jay began giving back to the Lightning program after graduating by becoming an assistant
        coach. Transitioning from a player role to a coaching role within the Lightning program afforded Jay a unique
        perspective that has driven him to &quot;pass on&quot; both the life and basketball lessons he learned as a
        Lightning player to the players he now coaches.{" "}
      </p>
    ),
    at: { photo: ["49/6/55/10", "21/20/27/24"], name: ["50/2/55/6", "22/15/26/20"], bio: ["55/2/75/10", "27/15/40/24"] },
  },
  {
    name: "Courtney Kidd",
    photo: courtney,
    intro: role("14U Head Coach"),
    bio: (
      <p>
        Basketball has been a part of Coach Courtney&apos;s life since the age of 8. He played basketball for Omaha
        Northwest and Omaha Bryan High Schools as a teenager, and then for Peru State College. Coach Courtney has also
        coached for the Omaha Boys and Girls Club, YMCA, and was an assistant coach at Peru State for camp and
        fundamentals programs. Coach Courtney strives to encourage his players through positive reinforcement with a
        goal of empowering every player to be confident in their abilities so they can perform at their highest level.
      </p>
    ),
    at: { photo: ["76/5/83/10", "25/8/31/12"], name: ["76/2/79/6", "26/4/30/9"], bio: ["83/2/96/10", "31/4/40/13"] },
  },
  {
    name: "Jerod Santo",
    photo: jerod,
    intro: role("12U Head Coach"),
    bio: (
      <p>
        Coach Jerod is a father of six children, three of which are playing Lightning Basketball this season. Coach
        Jerod also coached his sons&apos; EAA baseball team for the past five years. In addition to coaching, he
        regularly teaches Bible class at his church and at his home. Jerod is also the owner of an independent media
        company for software developers and still finds time to play pickup basketball a few times a week!
      </p>
    ),
    at: { photo: ["98/5/105/10", "40/8/47/12"], name: ["98/2/101/6", "41/4/46/9"], bio: ["105/2/115/10", "47/4/53/13"] },
  },
  {
    name: "Kevin Johnson",
    photo: kevin,
    intro: role("10U Head Coach"),
    bio: (
      <p>
        Coach Kevin was an active basketball player from an early age through high school. He has coached numerous
        soccer, baseball, football and basketball teams that his four sons have been a part of over the years. He finds
        coaching to be a great way to spend quality time with this sons, helping them develop as players, but more
        importantly, as men on their journey with Christ. He finds coaching basketball to be a great way to continue
        investing in others. Kevin spent ten years as a pastor and has a passion for helping people take their next
        steps- whatever those steps may be.
      </p>
    ),
    at: {
      photo: ["117/5/124/10", "40/20/47/24"],
      name: ["118/2/121/6", "41/15/45/20"],
      bio: ["124/2/137/10", "47/15/56/24"],
    },
  },
  {
    name: "Catherine Goeller",
    photo: catherine,
    intro: role("10U/12U Assistant Coach"),
    bio: (
      <>
        <p>
          Catherine Goeller has been involved with basketball for the majority of her life, playing for national
          powerhouse St. John Vianney High School in NJ, and both the United States Naval Academy and Longwood
          University at the NCAA Division 1 level.
        </p>
        <p>
          Catherine began coaching basketball at the age of 18, instructing players at summer camps and in private
          sessions. Her coaching experience includes coaching girls basketball at the HS level in VA and CT, and
          women’s lacrosse at the NCAA Division 3 level. Catherine began coaching with Omaha Lightning in 2025,
          alongside her three sons. She enjoys the positive, encouraging, competitive, and faith focused community that
          Omaha Lightning provides for the players, coaches, and families alike. In addition to coaching, she also
          really enjoys cheering all of the Lightning teams on from the sidelines!
        </p>
        <p>
          Catherine is a native of NJ, and has been transplanted in NE by her husband, Jason’s, military orders. Jason
          has been serving in the US Navy for almost 20 years. Together, they have been blessed with three precious
          sons, who truly enjoy being a part of Omaha Lightning Basketball.
        </p>
      </>
    ),
    at: {
      photo: ["137/7/144/10", "57/20/65/24"],
      name: ["138/2/141/7", "59/15/62/20"],
      bio: ["144/2/170/10", "65/15/83/24"],
    },
  },
  {
    name: "Micah Nelson",
    photo: micah,
    intro: (
      <>
        {role("12U Head Coach")}
        <Small />
      </>
    ),
    bio: (
      <p>
        {" "}
        My name is Micah Nelson, I{"\u00a0"}am the father of three children. Two boys and a girl. I have loved coaching all
        three of my children{"\u00a0"}in flag football, baseball, and basketball through the years. I enjoy the time to invest
        in my own kids and be able to have a positive influence on many other kids. I’m thankful to have been able to
        coach and have built some great relationships through it. My passion in coaching is helping kids learn more
        about the sport while also teaching them character and good{"\u00a0"}sportsmanship, but most importantly about the Lord.
        As a coach I feel like there is always new ways to grow and learn along side the kids.
      </p>
    ),
    at: {
      photo: ["172/6/179/11", "54/7/62/13"],
      name: ["173/2/178/6", "56/4/60/9"],
      bio: ["179/2/194/10", "62/4/71/13"],
    },
  },
  {
    name: "Phil Friesen",
    photo: phil,
    intro: role("10U Coach"),
    bio: (
      <p>
        Phil Friesen had the joy of playing for Omaha Lightning in high school, and then returning to coach in the
        elementary program a decade ago for an handful of years, and is now back, coaching again. Phil enjoys watching
        how quickly the boys develop new skills, how many practical applications to life that basketball offers, as
        well as how basketball enables the athletes to grow in their walk with the Lord. Phil and his wife, Katie, have
        two kids and he greatly enjoys how family oriented the Lightning program is!
      </p>
    ),
    at: {
      photo: ["194/6/201/10", "72/8/80/13"],
      name: ["195/2/198/6", "74/4/77/8"],
      bio: ["202/2/214/10", "81/4/89/13"],
    },
  },
  {
    name: "Rodney Wyatt",
    photo: rodney,
    intro: <p>Temporarily relocated in service of our country. </p>,
    bio: (
      <p>
        Coach Rodney&apos;s experience with basketball is extensive. He was a MCSAA High School Varsity Missouri State
        Basketball Champion as a high school student. He then moved on to play basketball for Maranatha Bible Baptist
        College and Ottawa University. His coaching experiences include being the assistant high school coach for
        Tri-Baptist HS, head coach for numerous Air Force base teams at places like Whiteman Air Force Base in Kansas
        and Aviano Air Force Base in Italy, and a youth basketball and baseball coach here in Omaha. He is also a
        National Alliance of Youth Sports member. Coach Rodney&apos;s primary goal as a coach is to build camaraderie
        and character through challenges and competition, while emphasizing that every member of the team deserves to
        be treated with encouragement and respect.{" "}
      </p>
    ),
    at: {
      photo: ["214/6/223/10", "92/9/100/13"],
      name: ["216/2/222/6", "93/4/97/9"],
      bio: ["223/2/242/10", "100/4/112/13"],
    },
  },
];

export default function CoachesPage() {
  return (
    <>
      <Section height={{ minHeight: "10vh", padding: "1vmax" }} rule rows={[12, 5]}>
        <Block m="4/2/10/10" d="2/4/6/22" align="center">
          <Text>
            <h1>Our Coaches</h1>
          </Text>
        </Block>
      </Section>

      <Section theme="white" height={{ minHeight: "10vh", padding: "1vmax" }} rows={[252, 111]}>
        {COACHES.map((coach) => (
          <CoachBlocks key={coach.name} coach={coach} />
        ))}
        <Block m="170/2/172/10" d="84/15/89/23">
          <Text>
            <p>
              <strong>NEW Coaches joining lightning for the 2026-27 season!</strong>
            </p>
            <p>
              <strong>-Thomas Rehm </strong>
            </p>
            <p>
              <strong>-Chris Woodhouse</strong>
            </p>
          </Text>
        </Block>
      </Section>
    </>
  );
}

function CoachBlocks({ coach }: { coach: Coach }) {
  const { at } = coach;
  return (
    <>
      <Block m={at.photo[0]} d={at.photo[1]} align="center">
        <Picture
          src={coach.photo}
          alt={coach.name}
          ratio={2 / 3}
          oval
          focus={coach.focus}
          sizes="(min-width: 768px) 15vw, 40vw"
        />
      </Block>
      <Block m={at.name[0]} d={at.name[1]}>
        <Text>
          <h4>{coach.name}</h4>
          {coach.intro}
        </Text>
      </Block>
      <Block m={at.bio[0]} d={at.bio[1]}>
        <Text>{coach.bio}</Text>
      </Block>
    </>
  );
}
