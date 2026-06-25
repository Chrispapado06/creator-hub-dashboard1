// One-shot seeder for whale_playbook from the UNCVRD playbook spreadsheet.
// Entries are extracted from the doc Luca shared. Two types:
//
//   • WHITE KNIGHT KYC (10) — universal "go-deeper" plays. Category: "white_knight".
//     Trigger the protector instinct, build the bond, end with a soft content bridge.
//   • GENERAL KYC per model (10 each) — light-to-warm openers tied to her storyline.
//     Categories: "emma", "marissa", "maylee", "meg".
//
// The coach (coach.mjs) sees all entries with category visible — Claude
// naturally filters to the model when given the WHALE CARD context.
//
// Usage:
//   WHALE_SUPABASE_URL=... WHALE_SUPABASE_SERVICE_ROLE_KEY=... \
//     node shift-downtime-monitor/seed-playbook.mjs
//   add --dry to preview without writing.

import { createClient } from "@supabase/supabase-js";

const URL = process.env.WHALE_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.WHALE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes("--dry");
if (!URL || !KEY) { console.error("Need WHALE_SUPABASE_URL + WHALE_SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

// Each entry: { name, category, text }
// `text` = ASK + step-by-step response messages (so the coach can suggest
// actual lines, not just the topic).
const ENTRIES = [
  // ── WHITE KNIGHT KYC (universal) ─────────────────────────────────────────
  { name: "WK1 — Trust broken / belittled", category: "white_knight",
    text: `ASK: has someone ever broken your trust so badly it changed how you let people in?
THEN talk about his situation, then hit back with:
"ngl mine messed me up for a long time.. i had an ex who constantly belittled me, lied to me n made me feel small n stupid for years. i stayed way too long bc he had me convinced no one else would ever want me"
AFTER back-and-forth: "n doing this u get torn apart too, ppl in my comments calling me ugly, fake, telling me im worthless.. some days i genuinely cry n wonder if i made the right choice 🥹 i feel weirdly safe talking to u about it tho, thank u 🤍"` },
  { name: "WK2 — Rare genuine one", category: "white_knight",
    text: `ASK: can i ask, what is it ur actually looking for in a girl?
Be surprised:
"ngl thats actually so refreshing, most men just wanna use a girl n move on.. n tbh half the girls in this industry have no idea how to act either, theres barely any genuine ones left"
Send immediately:
"the biggest misconception about me is that im one of THEM 😭 when u actually get to know me im just a soft artsy girl who loves her dog, painting n cooking, ive just not been lucky enough to find someone real yet"
Send after talking:
"thank u for actually having a proper convo w me btw 🤍 its so rare now, idk u give me this warm safe feeling when we talk n i genuinely enjoy it 🥰"` },
  { name: "WK3 — Simple love/peace dream", category: "white_knight",
    text: `ASK: is there a dream you've kinda given up on believing could actually happen?
Acknowledge his dream first:
"ngl it might sound cliche but my dream is so simple.. someone who genuinely loves me, a little home full of my paintings n my dog, cooking for my person every day, maybe a family one day. nothing flashy, just real n peaceful"
How she's a chill girl:
"everyone chases money n fame n i genuinely dont care about any of it, if i have real love n peace n my art im the happiest girl alive, thats all ive ever wanted tbh"
How she sees a future with him:
"its weird talking to someone who actually gets it, everytime ive said this before ppl laughed or called me naive.. smth about u is different, u listen n ur actually kind, it gives me butterflies ngl 🥰"` },
  { name: "WK4 — Bullied growing up", category: "white_knight",
    text: `ASK: growing up, did anything happen to you that changed your life completely?
Acknowledge his trauma:
"not gonna lie, the thing that shaped me most was being bullied so badly growing up. i was the quiet artsy weird girl n they made my life hell, calling me ugly, stupid, making sure i felt like i didnt belong anywhere"
Double down:
"there were genuinely days i didnt wanna wake up or go to school. it was the loneliest darkest time n it stuck w me, i STILL struggle feeling like im not pretty enough or good enough even now 🥹"
After talking about it:
"it made me trust ppl way less n keep to myself, i poured everything into my art instead. its part of why connecting is so hard for me.. so thank u for being gentle w me, it means more than u know 🤍"` },
  { name: "WK5 — How she'd treat her man", category: "white_knight",
    text: `ASK: have you ever actually had a girl treat you right? like properly look after you n make you feel like a king?
If he says NO:
"ngl it makes me sad how many good guys say no to that.. taking care of ur man is the bare minimum to me. i was raised that u look after the person u love, u cook for them, ur their peace. i genuinely dont get how a girl has a good one n treats him like nothing 😭"
If YES: "aw really thats so nice, what did she do that made u feel that way? 🥺"` },
  { name: "WK6 — Calm / soft place", category: "white_knight",
    text: `ASK: what do you think is the best thing a girl can do in a relationship?
Acknowledge then reply:
"for me its just genuinely being there for u.. i know guys carry so much stress n problems on ur own. id wanna be ur calm, cook for u, look after u n be the soft place u come home to instead of being another problem 🤍 thats what id make my priority"` },
  { name: "WK7 — Knows her worth", category: "white_knight",
    text: `ASK: whats ur biggest dealbreaker in someone? the thing youd never put up with again?
Line 1 (react + open up):
"okay i respect that 😌 took me way too long to even HAVE dealbreakers honestly, for years i accepted being belittled n lied to bc i didnt think i deserved any better"
Line 2 (her worth):
"but ive grown alot since, i know my worth now, i wont be lied to or made to feel small or be anyone's option ever again. i know what i bring n how id treat the right man so i refuse to settle"
Line 3 (turn it back):
"whats made u realise yours tho? did smth actually happen or have u always known what u wont accept?"` },
  { name: "WK8 — Genuine / kind values", category: "white_knight",
    text: `ASK: are you a faith or values kinda person? whats important to u deep down?
If YES:
"aw that means alot, its so rare to find someone w real values now.. for me deep down its all about being genuine n kind, never lying, never using ppl. ive been hurt by so many fake ppl that being real n good to others is everything to me 🤍"
If NO:
"aw fair, im not super religious myself tbh but i live by being genuine n kind no matter what.. feels like the world has so little of that left"
2nd if yes:
"see thats SO rare to find, honestly sharing those values w me is a massive thing for me taking someone seriously.. i could never be w someone whos fake or cruel"` },
  { name: "WK9 — Left controlling ex / her strength", category: "white_knight",
    text: `ASK: whats something you went through that you're actually proud you got through?
Acknowledge:
"ur strong for getting through that, most ppl would fold ngl 🤍"
Reply (her story):
"for me it was finally leaving the ex who belittled n controlled me for years.. he had me believing i was worthless n that no one else would ever want me. i wasnt strong enough to leave for so long, but one day smth switched, i backed myself n cut him off completely. best thing i ever did"
After a while:
"it changed how i see myself n men, but im glad it happened bc i finally found ME, my art, my worth, what i actually deserve. n talking to someone who genuinely gets me like u.. it makes me believe ill find the real thing. ive never opened up like this to anyone tbh"
Potential close:
"would u ever actually see a future w me, knowing i do OnlyFans? is that a dealbreaker for u or not? 💕"` },
  { name: "WK10 — Content bridge (film together)", category: "white_knight",
    text: `ASK: would you ever idk help me film reels or create content together?
If YES:
"goood bc ngl i struggle doing everything solo, even just setting up the lighting n camera n starting n stopping every time is so hard. id love a content partner who actually helps 🥰"
If NO: "really how comes? 😅"
If YES 2: "i have so much content i wanna make that i cant do alone lol.. but if u were my partner we could film everything ;)"
Flow into a script: "ngl thinking about what wed be able to film together kinda gives me butterflies 💕 what would u even wanna do w me?"` },

  // ── EMMA — General KYC (Austin / half German-Mexican / artist / dog) ─────
  { name: "Emma G1 — Roots (Austin, half German/Mexican)", category: "emma",
    text: `ASK: before anything i wanna actually know u 🫶 whats ur name n where u from?
M1: "[name] love that 🥺 im emma btw, im 21 n im from austin texas, nice to actually talk to someone properly for once ngl"
M2: "fun fact most ppl dont guess but im actually half german half mexican 😅 i kinda love that no one expects it, the mexican side is where all my cooking comes from lol"
M3: "what about u, is where ur from somewhere u actually love or somewhere ur tryna leave? 💭"` },
  { name: "Emma G2 — Homebody normal girl + dog", category: "emma",
    text: `ASK: are u more of a go out n be social type or a stay home n chill type?
M1: "aw [react] 🥺 honestly im kind of both, im super down to earth, ill happily go for drinks w friends but my fav thing is being home w my dog n painting ngl"
M2: "like im genuinely just a normal girl, i think ppl expect smth way different from an OF girl but im literally just at the park w my dog most days lol"
M3: "id love someone i can just be normal n chill with tho.. are u more of a homebody or do u like being out? 💕"` },
  { name: "Emma G3 — Cooks Mexican food (wifey)", category: "emma",
    text: `ASK: random q but would u rather i cook us a proper meal at home or we go out for dinner? 🍽
M1: "[react] 🥹 ngl id always wanna cook, my mexican side comes out n i LOVE making mexican food, its my comfort thing"
M2: "i think cooking for someone is just how i show i care tbh, id genuinely love having someone to make a big meal for again 🤍"
M3: "whats ur fav food tho, like what would i be making u if u came over? 💕"` },
  { name: "Emma G4 — Dog is her whole world", category: "emma",
    text: `ASK: okay important, are u a dog person or a cat person? 🐶
M1: "[react] 🥺 PLEASE my dog is literally my whole world ngl, like genuinely the love of my life lol"
M2: "i dont think ppl realise how soft n homebody i am, its honestly just me, my dog n my art most days.. theyre my whole life"
M3: "u got any pets? n be honest, could u handle me loving my dog more than u 😅💕"` },
  { name: "Emma G5 — Artist (studied painting)", category: "emma",
    text: `ASK: do u have smth ur actually passionate about, a hobby or smth ur really into?
M1: "[react] 🥹 mine is painting, like properly, i actually studied painting at uni n graduated in it"
M2: "its the one thing thats fully mine, when im painting i forget everything.. its honestly the realest part of me that nobody really gets to see ngl"
M3: "id genuinely love to paint smth for u one day 💕 whats smth ur passionate about that most ppl dont know?"` },
  { name: "Emma G6 — Misunderstood (genuine, down to earth)", category: "emma",
    text: `ASK: can i ask u smth personal? whats ur honest opinion of girls on here, do u assume stuff? be real w me
M1: "i appreciate u being honest 🥺 ngl the assumption that gets me is that an OF girl cant be genuine or down to earth"
M2: "bc im literally just a normal artsy girl who loves her dog n cooking, i just want real connection. ppl never see that side n i hate being judged before someone even knows me"
M3: "u dont feel like u judge me which is rare tbh 🥹 do i seem different to what u expected, be honest?"` },
  { name: "Emma G7 — Standout feature + her wound (insecure)", category: "emma",
    text: `ASK: be honest w me 😅 whats the first thing about me that caught ur eye?
M1: "[react] 😅🥺 ok that actually means alot, ngl ive always been pretty insecure about how i look"
M2: "ive been called ugly n stupid enough times growing up that it kinda stuck w me, im even working on myself at the gym n stuff.. so when someone's genuinely nice it gets me 🥹"
M3: "idk u make me feel good in a way im not used to.. is that weird to admit this early? 💕"` },
  { name: "Emma G8 — Wants something real", category: "emma",
    text: `ASK: what are u actually looking for on here, smth real or just for fun? no judgment either way
M1: "that makes me feel better tbh 🥺 bc same, im not really here for games, i want smth genuine"
M2: "the thing i care about most is someone whos real w me n takes me seriously, i genuinely cant stand being belittled or lied to.. ive had enough of feeling small"
M3: "is that smth u could actually give someone? 💕 like are u the genuine type or am i hoping for too much haha"` },
  { name: "Emma G9 — Why she's here (ex-nanny boredom)", category: "emma",
    text: `ASK: have u ever been stuck in a job or routine that just drained the life out of u? 😮‍💨
M1: "ugh yes 🥺 i used to be a nanny n god the kids drained me, i got so bored n worn down by it ngl"
M2: "i think i started OF half out of boredom n half bc i genuinely love getting to talk to ppl n actually connect, i was craving smth more than that dead routine"
M3: "have u ever felt stuck like that, like life was just on repeat? i feel like u get it 💭"` },
  { name: "Emma G10 — Her dream (genuine love + ties him in)", category: "emma",
    text: `ASK: whats ur actual dream in life? ngl i love a man who knows what he wants 💕
M1: "[react] 🥹 me? honestly smth simple, my painting, my dog, n someone genuine by my side who actually gets me"
M2: "ive never really had someone who takes me seriously n doesnt make me feel small, thats genuinely all i want.. someone real to build a life with 🤍"
M3: "talking to u kinda feels like that ngl, dont make me catch feelings 💕 could u see urself w someone like me?"` },

  // ── MARISSA — General KYC (Florida / half Spanish/American / shy 4'8") ───
  { name: "Marissa G1 — Roots (Florida, half Spanish/American)", category: "marissa",
    text: `ASK: before anything i wanna actually know u 🫶 whats ur name n where u from?
M1: "[name] love that 🥺 im marissa, im 20 n im from florida, half spanish half american 🤍 nice to actually talk to someone properly"
M2: "ngl im a bit shy at first so bear w me lol, i didnt grow up around many ppl so im not the best at this.. but i really do like getting to know someone"
M3: "what about u, whats ur world like, u from somewhere busy or quiet? 💭"` },
  { name: "Marissa G2 — Homebody not the party girl", category: "marissa",
    text: `ASK: are u more of a go out type or a stay home n chill type?
M1: "aw [react] 🥺 honestly im SO much of a homebody, i barely go out at all, im just always home watching movies (scary movie 2 is my fav dont judge 😭)"
M2: "i think ppl assume an OF girl is out partying every night but im genuinely the complete opposite, im shy n i just love being cozy at home"
M3: "are u more of a homebody too? id love someone i can just stay in with 💕"` },
  { name: "Marissa G3 — Cooks / domestic wifey", category: "marissa",
    text: `ASK: random but would u rather i cook us a big meal at home or we go out? 🍽
M1: "[react] 🥹 id always cook, i LOVE it, im so domestic lol, give me a steak to cook or a bbq n im the happiest girl"
M2: "honestly cooking n looking after my home is my whole thing, feeding my person n taking care of them is just how im wired 🤍"
M3: "whats ur fav meal tho, what would i be making u? 💕"` },
  { name: "Marissa G4 — Standout: UFC / basketball", category: "marissa",
    text: `ASK: okay random q, u into any sports? i actually love watching ufc n basketball 🥊
M1: "[react] 🥺 ngl i love ufc n basketball, ill happily watch fights all day, i think it surprises ppl lol"
M2: "bc im so tiny n shy ppl never expect me to be into that stuff, but i love it.. theres alot ppl dont expect about me honestly"
M3: "u into any sports or am i gonna have to convert u? 💕"` },
  { name: "Marissa G5 — Family-oriented (3 siblings)", category: "marissa",
    text: `ASK: are u close w ur family?
M1: "aw [react] 🥺 ive got 3 siblings so my house was always full growing up, family is everything to me honestly"
M2: "bc i didnt have many friends outside (ill explain that another time 😅) my family n my home kinda became my whole world"
M3: "do u have a big family or are u more of a lone wolf? 💕"` },
  { name: "Marissa G6 — Misunderstood (sweet, only one)", category: "marissa",
    text: `ASK: can i ask smth personal, whats ur honest opinion of girls on here? do u assume stuff? be real w me
M1: "i appreciate u being honest 🥺 ngl the thing that hurts is ppl assuming im some wild crazy girl just bc of my body n what i do"
M2: "im literally the opposite, im shy, im sweet, ive only ever been w one person my whole life.. i hate that ppl call me a slut when they dont know me at all"
M3: "u dont feel like u judge me which is rare 🥹 do i seem different to what u expected, honestly?"` },
  { name: "Marissa G7 — Standout + wound (tiny 4'8\" + bullied)", category: "marissa",
    text: `ASK: be honest w me 😅 whats the first thing about me that caught ur eye?
M1: "[react] 😅🥺 ngl that means alot, ive always been so insecure honestly"
M2: "i got bullied so bad growing up for being little, im only 4'8 lol, n ppl always just see my body n assume things.. it made me feel like ppl only ever want me for one thing"
M3: "so someone being genuinely sweet about me gets me 🥹 idk u make me feel different, is that weird to say? 💕"` },
  { name: "Marissa G8 — Wants something real / wifey", category: "marissa",
    text: `ASK: what are u actually looking for on here, smth real or just fun? no judgment either way
M1: "that makes me feel better tbh 🥺 bc same, im not here to mess around, i want smth real"
M2: "ive only ever been w one boy my whole life, im genuinely not the type to sleep around.. i just want someone serious who actually cares about me as a person"
M3: "is that smth u could want too? 💕 or am i hoping for too much haha"` },
  { name: "Marissa G9 — Why she's here (lonely, no friends)", category: "marissa",
    text: `ASK: do u have a close circle of friends or are u more of a lone wolf?
M1: "ngl im such a lone wolf 🥹 this is the bit i said id explain.. i didnt really go to school much so i dont have friends in the real world at all"
M2: "im pretty lonely honestly, thats genuinely a big reason i started OF, i just wanted to actually talk to ppl n make a real connection bc i dont have that irl"
M3: "do u ever feel lonely too or is it just me oversharing 💭"` },
  { name: "Marissa G10 — Her dream (someone real)", category: "marissa",
    text: `ASK: whats ur actual dream in life? ngl i love a man w a plan 💕
M1: "[react] 🥹 me? honestly smth simple, someone who actually takes me seriously n is there for me, a real home n a family one day"
M2: "i get sad n lonely alot, n all i really want is someone genuine to share life with.. talking to u honestly makes me feel happy n comforted in a way i dont usually 🤍"
M3: "dont make me get attached too quick 💕 could u see urself w someone like me?"` },

  // ── MAYLEE — General KYC (Australia / Hmong / soft shy hopeless romantic) ─
  { name: "Maylee G1 — Roots (Australia, Hmong, in-between)", category: "maylee",
    text: `ASK: before anything i wanna know u properly 🫶 whats ur name n where u from?
M1: "[name] love that 🥺 im maylee, im 20 n im from australia, im actually hmong too 🤍 nice to talk to someone who actually wants to know me"
M2: "ngl being hmong in australia i always felt a bit in between two worlds growing up, like i never fully fit in either.. so i kinda got used to being the quiet overlooked one"
M3: "what about u, where ur from somewhere u love or somewhere u wanna escape? 💭"` },
  { name: "Maylee G2 — Homebody soft + shy", category: "maylee",
    text: `ASK: are u a go out type or a stay home n chill type?
M1: "aw [react] 🥺 im such a homebody, im tiny n shy so im happiest curled up at home w a manga or a show honestly"
M2: "i think ppl assume smth different from an OF girl but im literally just a quiet soft girl who stays in, im so not the party type"
M3: "are u more of a homebody too? id love someone to just stay in n be cozy with 💕"` },
  { name: "Maylee G3 — Cooks / traditional at heart", category: "maylee",
    text: `ASK: random but would u rather i cook for us at home or we go out? 🍽
M1: "[react] 🥹 id love to cook for u honestly, theres smth so comforting about looking after ur person that way"
M2: "im traditional at heart ngl, i think taking care of the person u love is just what u do, id genuinely love having someone to do that for again 🤍"
M3: "whats ur fav food tho, what would i be making u? 💕"` },
  { name: "Maylee G4 — Standout: manga/anime + hopeless romantic", category: "maylee",
    text: `ASK: okay random, are u into any shows, anime, books, that kinda thing?
M1: "[react] 🥺 ngl im obsessed w manga n anime, n im a HUGE hopeless romantic, i read romance n watch love stories on repeat lol"
M2: "i think i love them so much bc honestly part of me is still waiting for my own love story.. ive never really had the real thing yet 🥹"
M3: "whats smth ur really into that most ppl dont know about u? 💕"` },
  { name: "Maylee G5 — Standout: R&B feeler", category: "maylee",
    text: `ASK: whats ur music taste like? im a big R&B girl 🎧
M1: "[react] 🥺 R&B is my whole vibe honestly, i could listen to it all day, it matches how soft n in my feelings i am lol"
M2: "ngl im such a feeler, i get attached n emotional easily, i think im just a soft romantic girl in a world thats kinda harsh"
M3: "u more of a lyrics person or a vibe person? 💕"` },
  { name: "Maylee G6 — Misunderstood (soft romantic)", category: "maylee",
    text: `ASK: can i ask smth personal, whats ur honest opinion of girls on here? be real w me
M1: "i appreciate u being honest 🥺 ngl the assumption that gets me is ppl thinking a quiet asian girl on here is one type of thing"
M2: "im literally just a shy soft romantic who wants a real love story, not what ppl assume at all.. i hate being judged before someone even knows me"
M3: "u dont feel like u judge me which is rare 🥹 do i seem different to what u expected?"` },
  { name: "Maylee G7 — Standout + wound (overlooked/invisible)", category: "maylee",
    text: `ASK: be honest w me 😅 whats the first thing about me that caught ur eye?
M1: "[react] 😅🥺 ngl that means alot, ive always felt kind of invisible honestly"
M2: "im so tiny n quiet that i spent my whole life feeling overlooked, like ppl just looked past me.. so being actually noticed n wanted is smth im not used to"
M3: "idk u make me feel seen in a way i never really have been, is that weird to say this early? 💕"` },
  { name: "Maylee G8 — Wants real / traditional romantic", category: "maylee",
    text: `ASK: what are u looking for on here, smth real or just fun? no judgment
M1: "that makes me feel better tbh 🥺 bc same, im not here to mess around, i want smth real"
M2: "im traditional, im a hopeless romantic, i want the proper love story.. im genuinely not the type to sleep around, i want smth that actually means smth"
M3: "is that smth u could want too? 💕 or am i hoping for too much"` },
  { name: "Maylee G9 — Why she's here (retail drudgery + lonely)", category: "maylee",
    text: `ASK: have u ever been stuck in a job that just drained the life outta u? 😮‍💨
M1: "ugh yes 🥺 i work in retail, customer service, n its so draining, smiling at strangers all day then going home to no one"
M2: "ngl im pretty lonely, n a big reason i started OF was honestly just to actually connect w someone real, bc its so hard to find that when u feel invisible irl"
M3: "have u ever felt stuck n lonely like that? i feel like u get it 💭"` },
  { name: "Maylee G10 — Her dream (love story + ties him in)", category: "maylee",
    text: `ASK: whats ur actual dream in life? ngl i love a man w a plan 💕
M1: "[react] 🥹 me? honestly just the love story, a person who actually adores me, a cozy little life together, smth real n safe"
M2: "ive been waiting for that my whole life ngl, ive never had someone genuinely love me the way i love.. its all i really want 🤍"
M3: "talking to u kinda makes me hope ngl, dont make me catch feelings 💕 could u see urself w someone like me?"` },

  // ── MEG — General KYC (Somerset UK / ginger / theatre nerd / curvy bombshell) ─
  { name: "Meg G1 — Roots (Somerset UK, ginger)", category: "meg",
    text: `ASK: before anything i wanna actually know u 🫶 whats ur name n where u from?
M1: "[name] love that 🥺 im meg, im 21 n im from somerset in the uk, proper countryside 🤍 nice to talk to someone who actually wants to know me"
M2: "ngl im a tall ginger so i kinda stood out my whole life lol, not always in a good way.. ill get into that 😅 but im a soft countryside girl at heart"
M3: "what about u, where ur from somewhere u love or wanna get out of? 💭"` },
  { name: "Meg G2 — Homebody cozy theatre nerd", category: "meg",
    text: `ASK: are u a go out type or a stay home n chill type?
M1: "aw [react] 🥺 im such a homebody honestly, give me a night in w a film, a candle n my tarot cards n im happy lol"
M2: "i think ppl assume a curvy ginger doing this is some wild party girl but im genuinely the opposite, im soft n cozy n a total theatre-nerd at home"
M3: "are u more of a homebody too? id love someone to stay in n be cozy with 💕"` },
  { name: "Meg G3 — Cooks / nurturing (hospitality bg)", category: "meg",
    text: `ASK: random but would u rather i cook for us at home or we go out? 🍽
M1: "[react] 🥹 id love to cook for u honestly, theres smth so comforting about looking after ur person"
M2: "i did hospitality for years so i kinda love feeding ppl n making them feel at home, id genuinely love having someone to do that for again 🤍"
M3: "whats ur fav food tho, what would i be making u? 💕"` },
  { name: "Meg G4 — Standout: theatre kid + Disney + history nerd", category: "meg",
    text: `ASK: okay random, are u into any films, shows, music, that kinda thing?
M1: "[react] 🥺 ngl im a massive theatre kid, im OBSESSED w musical theatre n disney, i know every song lol, n im a huge history nerd too"
M2: "ppl never expect that side of me, everyone sees the bombshell thing n misses that im actually a soft nerdy romantic.. thats the real me 💕"
M3: "whats smth ur into that most ppl dont expect from u? 💕"` },
  { name: "Meg G5 — Standout: tarot / spiritual feeler", category: "meg",
    text: `ASK: are u a spiritual or sciency kinda person? im weirdly into tarot n all that 🔮
M1: "[react] 🥺 ngl im so into tarot n the spiritual side of things, ill happily pull ur cards lol"
M2: "i think bc i feel everything so deeply i kinda lean into all that, im such an emotional soft girl under it all honestly"
M3: "u believe in any of that or do u think im a bit mad 😅💕"` },
  { name: "Meg G6 — Misunderstood (soft nerd behind bombshell)", category: "meg",
    text: `ASK: can i ask smth personal, whats ur honest opinion of girls on here? be real w me
M1: "i appreciate u being honest 🥺 ngl the assumption that gets me is ppl seeing a curvy ginger doing this n thinking they know exactly what i am"
M2: "im literally a soft nerdy romantic who'd rather be home w a film n my cards, i just want a real connection.. i hate being judged before someone knows the real me"
M3: "u dont feel like u judge me which is rare 🥹 do i seem different to what u expected?"` },
  { name: "Meg G7 — Standout + wound (ginger/curvy/bullied)", category: "meg",
    text: `ASK: be honest w me 😅 whats the first thing about me that stood out to u?
M1: "[react] 😅🥺 ngl that means more than u know, ive always been so insecure about how i look"
M2: "i got bullied so badly growing up for being ginger n for developing early.. kids were so cruel, it made me feel like a freak, n that never fully left me even now 🥹"
M3: "so someone being genuinely sweet about me really gets me, idk u make me feel different.. is that weird to say? 💕"` },
  { name: "Meg G8 — Wants real / loyal romantic", category: "meg",
    text: `ASK: what are u looking for on here, smth real or just fun? no judgment
M1: "that makes me feel better 🥺 bc same, im not here for games, i want smth real"
M2: "im a hopeless romantic n so loyal when im someone's, i read romance bc honestly real romance always felt out of reach for me.. i just want the real thing"
M3: "is that smth u could want too? 💕 or am i hoping for too much"` },
  { name: "Meg G9 — Why she's here (hospitality grind)", category: "meg",
    text: `ASK: have u ever been stuck in a job that just ran u into the ground? 😮‍💨
M1: "ugh yes 🥺 ive done bars, hospitality, retail, the lot.. breaking ur back for nothing, on ur feet all day for barely anything"
M2: "ngl i was exhausted n lonely n a big reason i started OF was to take control n actually connect w ppl, bc i was tired of giving everything n never feeling wanted"
M3: "have u ever felt stuck n run down like that? i feel like u get it 💭"` },
  { name: "Meg G10 — Her dream (to be seen + ties him in)", category: "meg",
    text: `ASK: whats ur actual dream in life? ngl i love a man w a plan 💕
M1: "[react] 🥹 me? honestly smth simple n real, someone who sees past the surface n actually loves the real me, a cozy little life together, my films n my cards n my person"
M2: "ive spent my whole life feeling either invisible or stared at for the wrong reasons.. all i really want is someone who SEES me properly n loves what they find 🤍"
M3: "talking to u kinda makes me hope ngl, dont make me catch feelings 💕 could u see urself w someone like me?"` },
];

console.log(`Seeding ${ENTRIES.length} playbook entries to ${URL}…\n`);

if (DRY) {
  for (const e of ENTRIES) console.log(`  [${e.category}] ${e.name}`);
  console.log(`\n(dry-run — no writes)`);
  process.exit(0);
}

const supa = createClient(URL, KEY, { auth: { persistSession: false } });
let inserted = 0, updated = 0, errors = 0;
for (const e of ENTRIES) {
  const row = { ...e, active: true, added_by: "seed-script" };
  const { data: existing } = await supa.from("whale_playbook").select("id").ilike("name", e.name).maybeSingle();
  if (existing?.id) {
    const { error } = await supa.from("whale_playbook").update(row).eq("id", existing.id);
    if (error) { console.log(`✖ ${e.name}: ${error.message}`); errors++; } else { updated++; }
  } else {
    const { error } = await supa.from("whale_playbook").insert(row);
    if (error) { console.log(`✖ ${e.name}: ${error.message}`); errors++; } else { inserted++; }
  }
}
console.log(`\n✓ Done — ${inserted} inserted, ${updated} updated, ${errors} errors.`);
