"""
Create Batch 9: 200 new verbs for auto_verbs/verbs/
Each folder gets:
  - prompt-create-trajectory.txt (verb description)
  - prompt-create-verb.txt (template reference)
"""
import os

VERBS_DIR = os.path.join(os.path.dirname(__file__), "verbs")
PROMPT_VERB_CONTENT = "Please follow the instruction auto_verbs\\common\\SystemPrompt2.txt.\n"

def trajectory(url, bullets):
    lines = ["Please read auto_verbs\\verbs\\SystemPrompt1.txt\n"]
    lines.append(f"* The target website\n{url}\n")
    lines.append("* Concrete task")
    for b in bullets:
        lines.append(f"- {b}")
    return "\n".join(lines) + "\n"

# ---------- 200 VERBS ----------

VERBS = [
    # ===== Multi-verb Extensions (25) =====
    ("google_com__shopping",
     "https://shopping.google.com",
     ["Search Google Shopping for \"wireless headphones\".",
      "Extract the top 5 product results: product name, price, store/seller, rating, and number of reviews.",
      "Print the list."]),

    ("google_com__flights",
     "https://www.google.com/travel/flights",
     ["Search for one-way flights from San Francisco (SFO) to New York (JFK) for next month.",
      "Extract the top 5 flight options: airline, departure time, arrival time, duration, number of stops, and price.",
      "Print the results."]),

    ("google_com__news",
     "https://news.google.com",
     ["Search Google News for \"artificial intelligence\".",
      "Extract the top 5 news articles: headline, source, publish time, and snippet.",
      "Print the list."]),

    ("amazon_com__reviews",
     "https://www.amazon.com",
     ["Search for \"kindle paperwhite\" and open the first product listing.",
      "Navigate to the customer reviews section.",
      "Extract the top 5 most helpful reviews: reviewer name, star rating, review title, date, and review text (first 200 chars).",
      "Print the reviews."]),

    ("amazon_com__subscribe",
     "https://www.amazon.com/subscribe-save/",
     ["Browse the Subscribe & Save section for \"baby\" category.",
      "Extract the top 5 items: product name, regular price, Subscribe & Save price, and discount percentage.",
      "Print the list."]),

    ("youtube_com__channels",
     "https://www.youtube.com",
     ["Search YouTube for channels related to \"science education\".",
      "Filter results by Channel type.",
      "Extract the top 5 channels: channel name, subscriber count, video count, and description.",
      "Print the results."]),

    ("youtube_com__shorts",
     "https://www.youtube.com/shorts",
     ["Browse YouTube Shorts trending feed.",
      "Extract the top 5 Shorts: title, channel name, view count, and likes.",
      "Print the results."]),

    ("reddit_com__communities",
     "https://www.reddit.com",
     ["Search Reddit for communities (subreddits) about \"photography\".",
      "Extract the top 5 subreddits: name, member count, description, and online count.",
      "Print the results."]),

    ("walmart_com__grocery",
     "https://www.walmart.com/cp/food/976759",
     ["Browse Walmart's grocery section for \"organic snacks\".",
      "Extract the top 5 products: product name, price, price per unit, rating, and availability.",
      "Print the results."]),

    ("target_com__deals",
     "https://www.target.com/circle/deals",
     ["Browse Target Circle deals in the \"Electronics\" category.",
      "Extract the top 5 deals: product name, original price, deal price, discount percentage, and deal expiration.",
      "Print the results."]),

    ("bestbuy_com__openBox",
     "https://www.bestbuy.com/site/electronics/open-box/pcmcat748300527084.c",
     ["Browse Best Buy Open-Box deals for \"laptops\".",
      "Extract the top 5 open-box items: product name, condition (Excellent, Satisfactory, etc.), open-box price, original price, and savings.",
      "Print the results."]),

    ("booking_com__attractions",
     "https://www.booking.com/attractions/",
     ["Search Booking.com attractions in \"Paris, France\".",
      "Extract the top 5 activities: name, category, price, rating, number of reviews, and duration.",
      "Print the results."]),

    ("expedia_com__carRental",
     "https://www.expedia.com/Cars",
     ["Search for car rentals in \"Los Angeles\" for a 3-day period next month.",
      "Extract the top 5 rental options: car type, company, price per day, total price, and included features.",
      "Print the results."]),

    ("tripadvisor_com__forums",
     "https://www.tripadvisor.com/ForumHome",
     ["Search TripAdvisor forums for discussions about \"Japan travel tips\".",
      "Extract the top 5 forum posts: title, forum name, author, reply count, and last reply date.",
      "Print the results."]),

    ("maps_google_com__places",
     "https://maps.google.com",
     ["Search Google Maps for \"coffee shops near Times Square, New York\".",
      "Extract the top 5 places: name, rating, number of reviews, address, opening hours, and price level.",
      "Print the results."]),

    ("yelp_com__events",
     "https://www.yelp.com/events",
     ["Browse Yelp events in \"San Francisco, CA\".",
      "Extract the top 5 upcoming events: event name, date, venue, category, and description.",
      "Print the results."]),

    ("zillow_com__mortgage",
     "https://www.zillow.com/mortgage-rates/",
     ["Look up current mortgage rates on Zillow.",
      "Extract rates for 30-year fixed, 15-year fixed, and 5/1 ARM: rate, APR, and monthly payment for a $400,000 loan.",
      "Print the comparison."]),

    ("goodreads_com__quotes",
     "https://www.goodreads.com/quotes",
     ["Search Goodreads quotes for the tag \"inspirational\".",
      "Extract the top 5 quotes: quote text, author, book title (if applicable), and number of likes.",
      "Print the quotes."]),

    ("etsy_com__sellers",
     "https://www.etsy.com",
     ["Search Etsy for shops selling \"handmade jewelry\".",
      "Extract the top 5 shops: shop name, location, star rating, number of sales, and description.",
      "Print the results."]),

    ("espn_com__fantasy",
     "https://www.espn.com/fantasy/football/",
     ["Browse ESPN Fantasy Football player rankings.",
      "Extract the top 10 ranked players: rank, name, team, position, and projected points.",
      "Print the rankings."]),

    ("spotify_com__charts",
     "https://charts.spotify.com/",
     ["Browse Spotify's Top Songs chart for the United States.",
      "Extract the top 10 songs: rank, song title, artist, peak position, and weeks on chart.",
      "Print the chart."]),

    ("github_com__discussions",
     "https://github.com/discussions",
     ["Search GitHub Discussions for \"machine learning best practices\".",
      "Extract the top 5 discussions: title, repository, author, answer count, and upvote count.",
      "Print the results."]),

    ("nytimes_com__recipes",
     "https://cooking.nytimes.com/",
     ["Search NYT Cooking for \"chicken soup\" recipes.",
      "Extract the top 5 recipes: recipe name, author, rating, number of ratings, and prep time.",
      "Print the results."]),

    ("ebay_com__motors",
     "https://www.ebay.com/motors",
     ["Search eBay Motors for \"Toyota Camry\" cars under $20,000.",
      "Extract the top 5 listings: title, price, mileage, year, location, and listing type (auction/buy-it-now).",
      "Print the results."]),

    ("airbnb_com__luxe",
     "https://www.airbnb.com/luxury",
     ["Browse Airbnb Luxe listings in \"Malibu, California\".",
      "Extract the top 5 luxury stays: property name, price per night, number of bedrooms, number of bathrooms, guest capacity, and rating.",
      "Print the results."]),

    # ===== Wedding & Events (5) =====
    ("theknot_com",
     "https://www.theknot.com",
     ["Search The Knot for wedding venues in \"Austin, Texas\".",
      "Extract the top 5 venues: venue name, capacity, price range, rating, and number of reviews.",
      "Print the results."]),

    ("weddingwire_com",
     "https://www.weddingwire.com",
     ["Search WeddingWire for wedding photographers in \"Chicago, Illinois\".",
      "Extract the top 5 photographers: name, price range, rating, number of reviews, and location.",
      "Print the results."]),

    ("zola_com",
     "https://www.zola.com",
     ["Browse Zola's wedding registry gift ideas in the \"Kitchen\" category.",
      "Extract the top 5 items: product name, brand, price, and number of registrants who added it.",
      "Print the results."]),

    ("brides_com",
     "https://www.brides.com",
     ["Search Brides for articles about \"outdoor wedding ideas\".",
      "Extract the top 5 articles: title, author, publish date, and summary.",
      "Print the results."]),

    ("minted_com",
     "https://www.minted.com",
     ["Search Minted for wedding invitation designs.",
      "Filter by style \"modern minimalist\".",
      "Extract the top 5 designs: design name, artist, price, and number of color options.",
      "Print the results."]),

    # ===== Genealogy & History (5) =====
    ("findagrave_com",
     "https://www.findagrave.com",
     ["Search Find a Grave for memorials with the last name \"Roosevelt\" in \"New York\".",
      "Extract the top 5 results: full name, birth date, death date, cemetery name, and location.",
      "Print the results."]),

    ("newspapers_com",
     "https://www.newspapers.com",
     ["Search historical newspapers for articles about \"moon landing 1969\".",
      "Extract the top 5 results: newspaper name, date, headline, location, and snippet.",
      "Print the results."]),

    ("smithsonianmag_com",
     "https://www.smithsonianmag.com",
     ["Search Smithsonian Magazine for articles about \"ancient Egypt\".",
      "Extract the top 5 articles: title, author, publish date, category, and summary.",
      "Print the results."]),

    ("worldhistory_org",
     "https://www.worldhistory.org",
     ["Search World History Encyclopedia for articles about \"Roman Empire\".",
      "Extract the top 5 articles: title, author, publish date, and summary.",
      "Print the results."]),

    ("history_com",
     "https://www.history.com",
     ["Search History.com for articles about \"World War II\".",
      "Extract the top 5 articles: title, author, publish date, category, and summary.",
      "Print the results."]),

    # ===== Personal Finance (6) =====
    ("nerdwallet_com",
     "https://www.nerdwallet.com",
     ["Search NerdWallet for the best credit cards for travel rewards.",
      "Extract the top 5 cards: card name, issuer, annual fee, rewards rate, sign-up bonus, and NerdWallet rating.",
      "Print the comparison."]),

    ("bankrate_com",
     "https://www.bankrate.com",
     ["Look up current high-yield savings account rates on Bankrate.",
      "Extract the top 5 accounts: bank name, APY, minimum deposit, and monthly fee.",
      "Print the comparison."]),

    ("creditcards_com",
     "https://www.creditcards.com",
     ["Search for the best balance transfer credit cards.",
      "Extract the top 5 cards: card name, intro APR, intro period, regular APR, annual fee, and balance transfer fee.",
      "Print the comparison."]),

    ("marketbeat_com",
     "https://www.marketbeat.com",
     ["Search MarketBeat for stock information on \"AAPL\" (Apple Inc.).",
      "Extract: current price, market cap, P/E ratio, dividend yield, 52-week high, 52-week low, and analyst consensus rating.",
      "Print the data."]),

    ("barrons_com",
     "https://www.barrons.com",
     ["Search Barron's for articles about \"technology stocks\".",
      "Extract the top 5 articles: headline, author, publish date, and summary.",
      "Print the results."]),

    ("kiplinger_com",
     "https://www.kiplinger.com",
     ["Search Kiplinger for articles about \"retirement planning\".",
      "Extract the top 5 articles: title, author, publish date, category, and summary.",
      "Print the results."]),

    # ===== Productivity & Tools (8) =====
    ("canva_com",
     "https://www.canva.com/templates/",
     ["Browse Canva design templates for \"Instagram posts\".",
      "Extract the top 5 templates: template name, category, dimensions, and whether it's free or premium.",
      "Print the results."]),

    ("figma_com",
     "https://www.figma.com/community",
     ["Search the Figma Community for \"dashboard\" design files.",
      "Extract the top 5 results: file name, creator, likes, duplicates count, and description.",
      "Print the results."]),

    ("notion_so",
     "https://www.notion.so/templates",
     ["Browse Notion templates for \"project management\".",
      "Extract the top 5 templates: template name, creator, category, and description.",
      "Print the results."]),

    ("hubspot_com",
     "https://blog.hubspot.com",
     ["Search HubSpot blog for articles about \"email marketing\".",
      "Extract the top 5 articles: title, author, publish date, category, and estimated read time.",
      "Print the results."]),

    ("zapier_com",
     "https://zapier.com/apps",
     ["Search Zapier for integrations (Zaps) involving \"Google Sheets\".",
      "Extract the top 5 popular Zaps: Zap name, connected apps, number of users, and description.",
      "Print the results."]),

    ("airtable_com",
     "https://www.airtable.com/templates",
     ["Browse Airtable templates for \"content calendar\".",
      "Extract the top 5 templates: template name, category, description, and number of uses.",
      "Print the results."]),

    ("mailchimp_com",
     "https://mailchimp.com/resources/",
     ["Search Mailchimp resources for articles about \"audience segmentation\".",
      "Extract the top 5 resources: title, type (guide, article, tutorial), and summary.",
      "Print the results."]),

    ("typeform_com",
     "https://www.typeform.com/templates/",
     ["Browse Typeform templates for \"customer feedback\" forms.",
      "Extract the top 5 templates: template name, category, number of questions, and description.",
      "Print the results."]),

    # ===== Social & Community (6) =====
    ("quora_com",
     "https://www.quora.com",
     ["Search Quora for questions about \"machine learning career\".",
      "Extract the top 5 questions: question text, number of answers, number of followers, and the top answer's author and upvote count.",
      "Print the results."]),

    ("medium_com",
     "https://medium.com",
     ["Search Medium for articles about \"startup fundraising\".",
      "Extract the top 5 articles: title, author, publication, read time, and clap count.",
      "Print the results."]),

    ("producthunt_com",
     "https://www.producthunt.com",
     ["Browse today's top product launches on Product Hunt.",
      "Extract the top 5 products: product name, tagline, upvote count, comment count, and maker name.",
      "Print the results."]),

    ("mastodon_social",
     "https://mastodon.social/explore",
     ["Browse trending posts on Mastodon.",
      "Extract the top 5 trending posts: author, content (first 200 chars), boost count, and favorite count.",
      "Print the results."]),

    ("lemmy_ml",
     "https://lemmy.ml",
     ["Browse the top communities on Lemmy.",
      "Extract the top 5 communities: community name, description, subscriber count, and number of posts.",
      "Print the results."]),

    ("slashdot_org",
     "https://slashdot.org",
     ["Browse the latest stories on Slashdot.",
      "Extract the top 5 stories: headline, department tag, author, comment count, and post date.",
      "Print the results."]),

    # ===== Beauty & Personal Care (5) =====
    ("sephora_com",
     "https://www.sephora.com",
     ["Search Sephora for \"moisturizer\" products.",
      "Extract the top 5 products: product name, brand, price, rating, number of reviews, and skin type suitability.",
      "Print the results."]),

    ("ulta_com",
     "https://www.ulta.com",
     ["Search Ulta for \"foundation\" products.",
      "Extract the top 5 products: product name, brand, price, rating, number of reviews, and shade count.",
      "Print the results."]),

    ("makeupalley_com",
     "https://www.makeupalley.com",
     ["Search MakeupAlley for reviews of \"mascara\" products.",
      "Extract the top 5 reviewed products: product name, brand, average rating, number of reviews, and repurchase percentage.",
      "Print the results."]),

    ("allure_com",
     "https://www.allure.com",
     ["Search Allure for articles about \"best sunscreens\".",
      "Extract the top 5 articles: title, author, publish date, and summary.",
      "Print the results."]),

    ("byrdie_com",
     "https://www.byrdie.com",
     ["Search Byrdie for skincare articles about \"retinol\".",
      "Extract the top 5 articles: title, author, publish date, and key takeaways.",
      "Print the results."]),

    # ===== Hobbies & Crafts (10) =====
    ("ravelry_com",
     "https://www.ravelry.com",
     ["Search Ravelry for knitting patterns tagged \"scarf\".",
      "Extract the top 5 patterns: pattern name, designer, difficulty level, yarn weight, and number of projects made.",
      "Print the results."]),

    ("brickset_com",
     "https://brickset.com",
     ["Search Brickset for LEGO sets in the \"Star Wars\" theme.",
      "Extract the top 5 sets: set name, set number, piece count, price, year released, and rating.",
      "Print the results."]),

    ("mtggoldfish_com",
     "https://www.mtggoldfish.com",
     ["Browse MTGGoldfish for the top Standard format Magic: The Gathering decks.",
      "Extract the top 5 decks: deck name, colors, meta share percentage, and average price.",
      "Print the results."]),

    ("tcgplayer_com",
     "https://www.tcgplayer.com",
     ["Search TCGPlayer for \"Charizard\" Pokemon trading cards.",
      "Extract the top 5 listings: card name, set, condition, price, and seller.",
      "Print the results."]),

    ("pokemondb_net",
     "https://pokemondb.net",
     ["Search PokemonDB for the Pokemon \"Pikachu\".",
      "Extract: name, Pokedex number, type(s), abilities, base stats (HP, Attack, Defense, Sp. Atk, Sp. Def, Speed), and evolution chain.",
      "Print the information."]),

    ("hobbylobby_com",
     "https://www.hobbylobby.com",
     ["Search Hobby Lobby for \"acrylic paint\" art supplies.",
      "Extract the top 5 products: product name, brand, price, and availability.",
      "Print the results."]),

    ("joann_com",
     "https://www.joann.com",
     ["Search JOANN for \"quilting fabric\" supplies.",
      "Extract the top 5 products: product name, price, price per yard, material type, and rating.",
      "Print the results."]),

    ("miniaturemarket_com",
     "https://www.miniaturemarket.com",
     ["Search Miniature Market for board games in the \"strategy\" category.",
      "Extract the top 5 games: name, publisher, price, player count, and play time.",
      "Print the results."]),

    ("chess_com",
     "https://www.chess.com",
     ["Browse Chess.com's leaderboard for the top blitz players.",
      "Extract the top 10 players: rank, username, rating, country, win/loss/draw record, and title (GM, IM, etc.).",
      "Print the leaderboard."]),

    ("lichess_org",
     "https://lichess.org",
     ["Browse Lichess daily puzzles or the puzzle database.",
      "Extract 5 puzzles: puzzle ID, rating, theme/motif, number of plays, and success rate.",
      "Print the puzzles."]),

    # ===== Agriculture & Rural (4) =====
    ("farmers_gov",
     "https://www.farmers.gov",
     ["Search Farmers.gov for USDA resources about \"crop insurance\".",
      "Extract the top 5 resources: title, category, description, and link.",
      "Print the results."]),

    ("tractorsupply_com",
     "https://www.tractorsupply.com",
     ["Search Tractor Supply Co. for \"chicken coops\".",
      "Extract the top 5 products: product name, brand, price, rating, and number of reviews.",
      "Print the results."]),

    ("agweb_com",
     "https://www.agweb.com",
     ["Search AgWeb for news articles about \"corn prices\".",
      "Extract the top 5 articles: headline, author, publish date, and summary.",
      "Print the results."]),

    ("modernfarmer_com",
     "https://modernfarmer.com",
     ["Search Modern Farmer for articles about \"regenerative agriculture\".",
      "Extract the top 5 articles: title, author, publish date, category, and summary.",
      "Print the results."]),

    # ===== Shopping (10) =====
    ("nordstrom_com",
     "https://www.nordstrom.com",
     ["Search Nordstrom for \"men's dress shoes\".",
      "Extract the top 5 products: product name, brand, price, rating, number of reviews, and available sizes.",
      "Print the results."]),

    ("anthropologie_com",
     "https://www.anthropologie.com",
     ["Search Anthropologie for \"throw pillows\" in home decor.",
      "Extract the top 5 products: product name, price, colors available, rating, and material.",
      "Print the results."]),

    ("asos_com",
     "https://www.asos.com",
     ["Search ASOS for \"women's dresses\" under $50.",
      "Extract the top 5 products: product name, brand, price, sizes available, and color options.",
      "Print the results."]),

    ("gap_com",
     "https://www.gap.com",
     ["Search Gap for \"men's jeans\".",
      "Extract the top 5 products: product name, style (slim, straight, etc.), price, colors, and available sizes.",
      "Print the results."]),

    ("uniqlo_com",
     "https://www.uniqlo.com/us/en/",
     ["Search UNIQLO for \"Ultra Light Down\" jackets.",
      "Extract the top 5 products: product name, price, colors, sizes, and rating.",
      "Print the results."]),

    ("nike_com",
     "https://www.nike.com",
     ["Search Nike for \"running shoes\" for men.",
      "Extract the top 5 products: shoe name, price, colors, available sizes, and rating.",
      "Print the results."]),

    ("newegg_com",
     "https://www.newegg.com",
     ["Search Newegg for \"graphics cards\".",
      "Extract the top 5 products: product name, brand, price, rating, number of reviews, and key specs (memory, clock speed).",
      "Print the results."]),

    ("iherb_com",
     "https://www.iherb.com",
     ["Search iHerb for \"vitamin D supplements\".",
      "Extract the top 5 products: product name, brand, price, dosage, serving count, and rating.",
      "Print the results."]),

    ("lowes_com",
     "https://www.lowes.com",
     ["Search Lowe's for \"cordless drills\".",
      "Extract the top 5 products: product name, brand, price, voltage, rating, and number of reviews.",
      "Print the results."]),

    ("staples_com",
     "https://www.staples.com",
     ["Search Staples for \"ergonomic office chairs\".",
      "Extract the top 5 products: product name, brand, price, rating, number of reviews, and key features.",
      "Print the results."]),

    # ===== Food & Dining (8) =====
    ("opentable_com",
     "https://www.opentable.com",
     ["Search OpenTable for restaurants in \"New York City\" with cuisine type \"Italian\".",
      "Extract the top 5 restaurants: name, cuisine, price range, rating, number of reviews, and next available reservation time.",
      "Print the results."]),

    ("zagat_com",
     "https://www.zagat.com",
     ["Search Zagat for top-rated restaurants in \"Los Angeles\".",
      "Extract the top 5 restaurants: name, cuisine, neighborhood, Zagat food/decor/service scores, and price range.",
      "Print the results."]),

    ("foodnetwork_com",
     "https://www.foodnetwork.com",
     ["Search Food Network for \"chocolate cake\" recipes.",
      "Extract the top 5 recipes: recipe name, chef/show, rating, number of reviews, prep time, and difficulty level.",
      "Print the results."]),

    ("kingarthurbaking_com",
     "https://www.kingarthurbaking.com/recipes",
     ["Search King Arthur Baking for \"sourdough bread\" recipes.",
      "Extract the top 5 recipes: recipe name, rating, number of reviews, prep time, bake time, and difficulty.",
      "Print the results."]),

    ("smittenkitchen_com",
     "https://smittenkitchen.com",
     ["Search Smitten Kitchen for recipes tagged \"vegetarian\".",
      "Extract the top 5 recipes: recipe name, publish date, description, and comment count.",
      "Print the results."]),

    ("cookstr_com",
     "https://www.cookstr.com",
     ["Search Cookstr for \"pasta\" recipes from famous cookbooks.",
      "Extract the top 5 recipes: recipe name, cookbook title, author, and cuisine type.",
      "Print the results."]),

    ("chowhound_com",
     "https://www.chowhound.com",
     ["Search Chowhound for articles about \"best pizza in Chicago\".",
      "Extract the top 5 articles: title, author, publish date, and summary.",
      "Print the results."]),

    ("delish_com",
     "https://www.delish.com",
     ["Search Delish for \"slow cooker\" recipes.",
      "Extract the top 5 recipes: recipe name, total time, servings, rating, and description.",
      "Print the results."]),

    # ===== Travel (8) =====
    ("kayak_com",
     "https://www.kayak.com",
     ["Search Kayak for flights from \"Boston\" to \"London\" round-trip next month.",
      "Extract the top 5 options: airline(s), departure/arrival times, duration, stops, and price.",
      "Print the results."]),

    ("trivago_com",
     "https://www.trivago.com",
     ["Search Trivago for hotels in \"Barcelona, Spain\" for 2 nights next month.",
      "Extract the top 5 hotels: hotel name, star rating, guest rating, price per night, and neighborhood.",
      "Print the results."]),

    ("agoda_com",
     "https://www.agoda.com",
     ["Search Agoda for hotels in \"Bangkok, Thailand\" for 3 nights.",
      "Extract the top 5 hotels: hotel name, star rating, guest score, price per night, and distance from city center.",
      "Print the results."]),

    ("orbitz_com",
     "https://www.orbitz.com",
     ["Search Orbitz for vacation packages to \"Cancun, Mexico\".",
      "Extract the top 5 packages: hotel name, flight included (yes/no), total price, duration, and rating.",
      "Print the results."]),

    ("momondo_com",
     "https://www.momondo.com",
     ["Search Momondo for the cheapest flights from \"Chicago\" to \"Tokyo\".",
      "Extract the top 5 flights: airline, departure/arrival times, duration, stops, and price.",
      "Print the results."]),

    ("kiwi_com",
     "https://www.kiwi.com",
     ["Search Kiwi.com for flights from \"Berlin\" to \"Rome\" one-way.",
      "Extract the top 5 options: airline, departure/arrival, duration, stops, and price.",
      "Print the results."]),

    ("thetrainline_com",
     "https://www.thetrainline.com",
     ["Search Trainline for train tickets from \"London\" to \"Paris\" for tomorrow.",
      "Extract the top 5 options: operator, departure time, arrival time, duration, and price.",
      "Print the results."]),

    ("rentalcars_com",
     "https://www.rentalcars.com",
     ["Search RentalCars.com for car rentals at \"Miami International Airport\" for 5 days.",
      "Extract the top 5 options: car type, rental company, price per day, total price, and included features.",
      "Print the results."]),

    # ===== Entertainment (8) =====
    ("fandango_com",
     "https://www.fandango.com",
     ["Search Fandango for movies playing near \"90210\" (Beverly Hills zip code).",
      "Extract the top 5 movies: movie title, genre, runtime, Fandango score, and next available showtime.",
      "Print the results."]),

    ("tubi_tv",
     "https://tubitv.com",
     ["Browse Tubi's free movie catalog in the \"Thriller\" genre.",
      "Extract the top 5 movies: title, year, rating (PG-13, R, etc.), duration, and description.",
      "Print the results."]),

    ("shudder_com",
     "https://www.shudder.com",
     ["Browse Shudder's horror movie catalog for \"supernatural\" films.",
      "Extract the top 5 movies: title, year, director, duration, and description.",
      "Print the results."]),

    ("criterionchannel_com",
     "https://www.criterionchannel.com",
     ["Browse the Criterion Channel's curated film collections.",
      "Extract the top 5 collections: collection name, number of films, curator, and description.",
      "Print the results."]),

    ("thetvdb_com",
     "https://thetvdb.com",
     ["Search TheTVDB for TV show \"Breaking Bad\".",
      "Extract: show name, network, status, first/last air dates, number of seasons, number of episodes, genre, and rating.",
      "Print the information."]),

    ("pluto_tv",
     "https://pluto.tv",
     ["Browse Pluto TV's free streaming channels in the \"News\" category.",
      "Extract the top 5 channels: channel name, description, and current program airing.",
      "Print the results."]),

    ("tunefind_com",
     "https://www.tunefind.com",
     ["Search Tunefind for music featured in the TV show \"Stranger Things\".",
      "Extract the top 5 songs: song title, artist, season/episode it appeared in, and scene description.",
      "Print the results."]),

    ("tvmaze_com",
     "https://www.tvmaze.com",
     ["Search TVmaze for the TV show \"The Office\".",
      "Extract: show name, network, status, premiered date, genres, rating, and a list of the first 5 episodes with titles and air dates.",
      "Print the information."]),

    # ===== Education (8) =====
    ("khanacademy_org",
     "https://www.khanacademy.org",
     ["Browse Khan Academy courses in the \"Computer Science\" domain.",
      "Extract the top 5 courses: course name, unit count, estimated time, and description.",
      "Print the results."]),

    ("edx_org",
     "https://www.edx.org",
     ["Search edX for online courses about \"data science\".",
      "Extract the top 5 courses: course name, institution, instructor, duration, level (introductory, intermediate), and whether it's free or paid.",
      "Print the results."]),

    ("udacity_com",
     "https://www.udacity.com",
     ["Browse Udacity nanodegree programs in \"artificial intelligence\".",
      "Extract the top 5 programs: program name, estimated duration, skill level, and key skills covered.",
      "Print the results."]),

    ("brilliant_org",
     "https://brilliant.org",
     ["Browse Brilliant.org courses in \"Mathematics\".",
      "Extract the top 5 courses: course name, level, lesson count, and description.",
      "Print the results."]),

    ("masterclass_com",
     "https://www.masterclass.com",
     ["Browse MasterClass classes in the \"Cooking\" category.",
      "Extract the top 5 classes: instructor name, class title, number of lessons, total runtime, and description.",
      "Print the results."]),

    ("pluralsight_com",
     "https://www.pluralsight.com",
     ["Search Pluralsight for courses on \"Kubernetes\".",
      "Extract the top 5 courses: course title, author, skill level, duration, and rating.",
      "Print the results."]),

    ("coursehero_com",
     "https://www.coursehero.com",
     ["Search Course Hero for study resources about \"organic chemistry\".",
      "Extract the top 5 resources: document title, course name, school, type (notes, flashcards, etc.), and number of views.",
      "Print the results."]),

    ("chegg_com",
     "https://www.chegg.com",
     ["Search Chegg for textbook solutions in \"calculus\".",
      "Extract the top 5 textbooks: textbook title, author, edition, number of solutions available, and price for access.",
      "Print the results."]),

    # ===== Health (8) =====
    ("webmd_com",
     "https://www.webmd.com",
     ["Search WebMD for information about \"Type 2 Diabetes\".",
      "Extract: condition name, overview, symptoms list, causes, risk factors, and treatment options.",
      "Print the information."]),

    ("mayoclinic_org",
     "https://www.mayoclinic.org",
     ["Search Mayo Clinic for information about \"high blood pressure\".",
      "Extract: condition name, definition, symptoms, causes, risk factors, and when to see a doctor.",
      "Print the information."]),

    ("clevelandclinic_org",
     "https://my.clevelandclinic.org/health",
     ["Search Cleveland Clinic for health articles about \"migraine\".",
      "Extract: condition name, overview, symptoms, causes, diagnosis methods, and management/treatment.",
      "Print the information."]),

    ("verywellhealth_com",
     "https://www.verywellhealth.com",
     ["Search Verywell Health for articles about \"vitamin B12 deficiency\".",
      "Extract the top 5 articles: title, author, medical reviewer, publish date, and summary.",
      "Print the results."]),

    ("mindbodygreen_com",
     "https://www.mindbodygreen.com",
     ["Search mindbodygreen for wellness articles about \"gut health\".",
      "Extract the top 5 articles: title, author, publish date, category, and summary.",
      "Print the results."]),

    ("everydayhealth_com",
     "https://www.everydayhealth.com",
     ["Search Everyday Health for articles about \"arthritis management\".",
      "Extract the top 5 articles: title, author, medical reviewer, publish date, and summary.",
      "Print the results."]),

    ("menshealth_com",
     "https://www.menshealth.com",
     ["Search Men's Health for fitness articles about \"strength training for beginners\".",
      "Extract the top 5 articles: title, author, publish date, category, and summary.",
      "Print the results."]),

    ("womenshealthmag_com",
     "https://www.womenshealthmag.com",
     ["Search Women's Health for articles about \"HIIT workouts\".",
      "Extract the top 5 articles: title, author, publish date, category, and summary.",
      "Print the results."]),

    # ===== Jobs & Career (6) =====
    ("monster_com",
     "https://www.monster.com",
     ["Search Monster for \"software engineer\" jobs in \"Seattle, WA\".",
      "Extract the top 5 job listings: job title, company, location, salary range (if shown), and post date.",
      "Print the results."]),

    ("ziprecruiter_com",
     "https://www.ziprecruiter.com",
     ["Search ZipRecruiter for \"data analyst\" jobs in \"Denver, CO\".",
      "Extract the top 5 listings: job title, company, location, salary estimate, and days posted.",
      "Print the results."]),

    ("simplyhired_com",
     "https://www.simplyhired.com",
     ["Search SimplyHired for \"product manager\" jobs in \"San Francisco, CA\".",
      "Extract the top 5 listings: job title, company, location, estimated salary, and description snippet.",
      "Print the results."]),

    ("careerbuilder_com",
     "https://www.careerbuilder.com",
     ["Search CareerBuilder for \"marketing manager\" jobs in \"New York, NY\".",
      "Extract the top 5 listings: job title, company, location, salary range, and employment type.",
      "Print the results."]),

    ("flexjobs_com",
     "https://www.flexjobs.com",
     ["Search FlexJobs for remote \"UX designer\" positions.",
      "Extract the top 5 listings: job title, company, job type (full-time/part-time), flexibility type (remote/hybrid), and location.",
      "Print the results."]),

    ("wellfound_com",
     "https://wellfound.com",
     ["Search Wellfound (AngelList Talent) for startup jobs in \"machine learning\".",
      "Extract the top 5 listings: job title, company name, salary range, equity range, and company stage (seed, series A, etc.).",
      "Print the results."]),

    # ===== Tech & Developer (8) =====
    ("npmjs_com",
     "https://www.npmjs.com",
     ["Search npm for packages related to \"date formatting\".",
      "Extract the top 5 packages: package name, version, weekly downloads, description, and last publish date.",
      "Print the results."]),

    ("pypi_org",
     "https://pypi.org",
     ["Search PyPI for Python packages related to \"web scraping\".",
      "Extract the top 5 packages: package name, version, description, author, and last release date.",
      "Print the results."]),

    ("crates_io",
     "https://crates.io",
     ["Search crates.io for Rust crates related to \"async runtime\".",
      "Extract the top 5 crates: crate name, version, downloads, description, and last updated.",
      "Print the results."]),

    ("rubygems_org",
     "https://rubygems.org",
     ["Search RubyGems for gems related to \"authentication\".",
      "Extract the top 5 gems: gem name, version, total downloads, description, and last release date.",
      "Print the results."]),

    ("dockerhub_com",
     "https://hub.docker.com",
     ["Search Docker Hub for \"python\" images.",
      "Extract the top 5 images: image name, publisher, pulls, stars, and last updated.",
      "Print the results."]),

    ("hackernoon_com",
     "https://hackernoon.com",
     ["Search HackerNoon for articles about \"blockchain development\".",
      "Extract the top 5 articles: title, author, publish date, read time, and number of reactions.",
      "Print the results."]),

    ("infoq_com",
     "https://www.infoq.com",
     ["Search InfoQ for articles about \"microservices architecture\".",
      "Extract the top 5 articles: title, author, publish date, topic, and summary.",
      "Print the results."]),

    ("smashingmagazine_com",
     "https://www.smashingmagazine.com",
     ["Search Smashing Magazine for articles about \"CSS Grid layout\".",
      "Extract the top 5 articles: title, author, publish date, category, and summary.",
      "Print the results."]),

    # ===== Sports (6) =====
    ("nba_com",
     "https://www.nba.com",
     ["Browse NBA standings for the current season.",
      "Extract all teams from the Eastern Conference: team name, wins, losses, win percentage, games behind, and streak.",
      "Print the standings."]),

    ("mlb_com",
     "https://www.mlb.com",
     ["Browse MLB standings for the current season's American League.",
      "Extract all teams: team name, wins, losses, win percentage, games behind, and last 10 record.",
      "Print the standings."]),

    ("nfl_com",
     "https://www.nfl.com",
     ["Browse NFL standings for the current season's AFC.",
      "Extract all teams: team name, division, wins, losses, ties, win percentage, and points for/against.",
      "Print the standings."]),

    ("premierleague_com",
     "https://www.premierleague.com",
     ["Browse the Premier League standings table for the current season.",
      "Extract the top 10 teams: position, team name, played, won, drawn, lost, goals for, goals against, goal difference, and points.",
      "Print the standings."]),

    ("whoscored_com",
     "https://www.whoscored.com",
     ["Browse WhoScored for top-rated football/soccer players in the Premier League this season.",
      "Extract the top 10 players: name, team, position, appearances, goals, assists, and WhoScored rating.",
      "Print the rankings."]),

    ("oddsshark_com",
     "https://www.oddsshark.com",
     ["Browse OddsShark for today's NFL game odds.",
      "Extract all games: teams, spread, over/under, moneyline odds, and game time.",
      "Print the odds."]),

    # ===== Government (5) =====
    ("gao_gov",
     "https://www.gao.gov",
     ["Search GAO (Government Accountability Office) for reports about \"cybersecurity\".",
      "Extract the top 5 reports: report title, report number, publish date, and summary.",
      "Print the results."]),

    ("usajobs_gov",
     "https://www.usajobs.gov",
     ["Search USAJobs for federal positions in \"information technology\" in Washington, DC.",
      "Extract the top 5 listings: job title, agency, salary range, grade level, and closing date.",
      "Print the results."]),

    ("ssa_gov",
     "https://www.ssa.gov",
     ["Search the SSA website for information about \"retirement benefits\".",
      "Extract: topic name, eligibility age, benefit calculation overview, and links to key resources.",
      "Print the information."]),

    ("bls_gov",
     "https://www.bls.gov",
     ["Search the Bureau of Labor Statistics for data on \"unemployment rate\".",
      "Extract: current unemployment rate, previous month rate, year-over-year change, and a breakdown by demographic group.",
      "Print the data."]),

    ("opm_gov",
     "https://www.opm.gov",
     ["Search OPM for information about federal employee \"GS pay scale\".",
      "Extract the 2024 GS pay scale: grade levels GS-1 through GS-15 with Step 1 and Step 10 annual salaries.",
      "Print the pay table."]),

    # ===== Science (5) =====
    ("newscientist_com",
     "https://www.newscientist.com",
     ["Search New Scientist for articles about \"quantum computing\".",
      "Extract the top 5 articles: title, author, publish date, and summary.",
      "Print the results."]),

    ("livescience_com",
     "https://www.livescience.com",
     ["Search Live Science for articles about \"black holes\".",
      "Extract the top 5 articles: title, author, publish date, and summary.",
      "Print the results."]),

    ("phys_org",
     "https://phys.org",
     ["Search Phys.org for articles about \"CRISPR gene editing\".",
      "Extract the top 5 articles: title, source institution, publish date, and summary.",
      "Print the results."]),

    ("scientificamerican_com",
     "https://www.scientificamerican.com",
     ["Search Scientific American for articles about \"climate change\".",
      "Extract the top 5 articles: title, author, publish date, and summary.",
      "Print the results."]),

    ("eurekalert_org",
     "https://www.eurekalert.org",
     ["Search EurekAlert! for recent press releases about \"Alzheimer's research\".",
      "Extract the top 5 releases: headline, institution, publish date, and summary.",
      "Print the results."]),

    # ===== Books (5) =====
    ("bookshop_org",
     "https://bookshop.org",
     ["Search Bookshop.org for books about \"science fiction\".",
      "Extract the top 5 books: title, author, price, publisher, and description.",
      "Print the results."]),

    ("abebooks_com",
     "https://www.abebooks.com",
     ["Search AbeBooks for first edition copies of \"To Kill a Mockingbird\".",
      "Extract the top 5 listings: title, author, edition, condition, seller, and price.",
      "Print the results."]),

    ("bookriot_com",
     "https://bookriot.com",
     ["Search Book Riot for articles about \"best fantasy novels\".",
      "Extract the top 5 articles: title, author, publish date, and summary.",
      "Print the results."]),

    ("audiobooks_com",
     "https://www.audiobooks.com",
     ["Search Audiobooks.com for audiobooks in the \"mystery\" genre.",
      "Extract the top 5 audiobooks: title, author, narrator, duration, and rating.",
      "Print the results."]),

    ("libro_fm",
     "https://libro.fm",
     ["Search Libro.fm for audiobooks about \"self-improvement\".",
      "Extract the top 5 audiobooks: title, author, narrator, duration, and price.",
      "Print the results."]),

    # ===== Automotive (4) =====
    ("autotrader_com",
     "https://www.autotrader.com",
     ["Search AutoTrader for used \"Honda Civic\" cars under $25,000 within 50 miles of zip code 60601.",
      "Extract the top 5 listings: year, make/model, trim, mileage, price, dealer name, and location.",
      "Print the results."]),

    ("cargurus_com",
     "https://www.cargurus.com",
     ["Search CarGurus for used \"Tesla Model 3\" cars.",
      "Extract the top 5 listings: year, trim, mileage, price, deal rating (great/good/fair), and seller name.",
      "Print the results."]),

    ("kbb_com",
     "https://www.kbb.com",
     ["Look up the Kelley Blue Book value for a 2021 Toyota RAV4 with 30,000 miles in \"good\" condition.",
      "Extract: trade-in value, private party value, suggested retail price, and fair market range.",
      "Print the values."]),

    ("truecar_com",
     "https://www.truecar.com",
     ["Search TrueCar for new \"Ford F-150\" pricing.",
      "Extract: model/trim options, MSRP, TrueCar average price paid, potential savings, and nearby dealer inventory count.",
      "Print the pricing data."]),

    # ===== Real Estate (4) =====
    ("realtor_com",
     "https://www.realtor.com",
     ["Search Realtor.com for homes for sale in \"Austin, TX\" priced between $300,000 and $500,000.",
      "Extract the top 5 listings: address, price, bedrooms, bathrooms, square footage, and listing status.",
      "Print the results."]),

    ("homes_com",
     "https://www.homes.com",
     ["Search Homes.com for homes for sale in \"Portland, OR\".",
      "Extract the top 5 listings: address, price, bedrooms, bathrooms, square footage, and year built.",
      "Print the results."]),

    ("rent_com",
     "https://www.rent.com",
     ["Search Rent.com for apartments in \"Denver, CO\" with 2 bedrooms.",
      "Extract the top 5 listings: property name, rent range, bedrooms, bathrooms, square footage, and amenities.",
      "Print the results."]),

    ("apartmentlist_com",
     "https://www.apartmentlist.com",
     ["Search Apartment List for apartments in \"Seattle, WA\".",
      "Extract the top 5 listings: property name, rent range, bedrooms, bathrooms, rating, and top amenities.",
      "Print the results."]),

    # ===== B2B/Business (6) =====
    ("thomasnet_com",
     "https://www.thomasnet.com",
     ["Search ThomasNet for industrial suppliers of \"CNC machining services\".",
      "Extract the top 5 suppliers: company name, location, annual revenue range, number of employees, and certifications.",
      "Print the results."]),

    ("alibaba_com",
     "https://www.alibaba.com",
     ["Search Alibaba for wholesale \"LED strip lights\".",
      "Extract the top 5 products: product name, supplier, price range, minimum order quantity, and supplier rating.",
      "Print the results."]),

    ("fiverr_com",
     "https://www.fiverr.com",
     ["Search Fiverr for freelancers offering \"logo design\" services.",
      "Extract the top 5 gigs: gig title, seller name, seller level, price starting from, rating, and number of reviews.",
      "Print the results."]),

    ("upwork_com",
     "https://www.upwork.com",
     ["Search Upwork for freelancers specializing in \"React development\".",
      "Extract the top 5 freelancers: name, title, hourly rate, job success score, total earnings, and skills.",
      "Print the results."]),

    ("99designs_com",
     "https://99designs.com",
     ["Browse 99designs for \"website design\" contest entries.",
      "Extract the top 5 designs: designer name, design style, rating, number of contests won, and price range.",
      "Print the results."]),

    ("clutch_co",
     "https://clutch.co",
     ["Search Clutch for top \"web development\" agencies in the United States.",
      "Extract the top 5 agencies: company name, location, minimum project size, hourly rate, Clutch rating, and number of reviews.",
      "Print the results."]),

    # ===== Fashion/Style (4) =====
    ("fashionphile_com",
     "https://www.fashionphile.com",
     ["Search Fashionphile for pre-owned \"Louis Vuitton\" handbags.",
      "Extract the top 5 listings: product name, condition, price, original retail price, and savings.",
      "Print the results."]),

    ("therealreal_com",
     "https://www.therealreal.com",
     ["Search The RealReal for consignment \"Gucci\" items.",
      "Extract the top 5 items: item name, designer, condition, estimated retail price, and sale price.",
      "Print the results."]),

    ("renttherunway_com",
     "https://www.renttherunway.com",
     ["Browse Rent the Runway for dresses available for \"black tie\" events.",
      "Extract the top 5 dresses: designer, dress name, rental price, retail price, available sizes, and rating.",
      "Print the results."]),

    ("whowhatwear_com",
     "https://www.whowhatwear.com",
     ["Search Who What Wear for fashion trend articles about \"spring 2025\".",
      "Extract the top 5 articles: title, author, publish date, and summary.",
      "Print the results."]),

    # ===== Gaming (5) =====
    ("giantbomb_com",
     "https://www.giantbomb.com",
     ["Search Giant Bomb for information about the game \"Elden Ring\".",
      "Extract: game title, platforms, release date, developer, publisher, genre, and user rating.",
      "Print the information."]),

    ("pricecharting_com",
     "https://www.pricecharting.com",
     ["Search PriceCharting for \"Super Mario Bros\" retro game prices.",
      "Extract the top 5 listings: game title, platform, loose price, complete price, new price, and price trend.",
      "Print the results."]),

    ("dekudeals_com",
     "https://www.dekudeals.com",
     ["Browse Deku Deals for current Nintendo Switch game deals.",
      "Extract the top 5 deals: game title, current price, regular price, discount percentage, and rating.",
      "Print the results."]),

    ("gamefaqs_com",
     "https://gamefaqs.gamespot.com",
     ["Search GameFAQs for guides and walkthroughs for \"The Legend of Zelda: Tears of the Kingdom\".",
      "Extract the top 5 FAQs/guides: guide title, author, type (walkthrough, FAQ, etc.), and rating.",
      "Print the results."]),

    ("gg_deals_com",
     "https://gg.deals",
     ["Browse GG.deals for the best current PC game deals.",
      "Extract the top 5 deals: game title, store, current price, historical low, and discount percentage.",
      "Print the results."]),

    # ===== Retail & Home (8) =====
    ("walgreens_com",
     "https://www.walgreens.com",
     ["Search Walgreens for \"allergy medicine\" products.",
      "Extract the top 5 products: product name, brand, price, size/count, and rating.",
      "Print the results."]),

    ("chewy_com",
     "https://www.chewy.com",
     ["Search Chewy for \"dog food\" products in the \"grain-free\" category.",
      "Extract the top 5 products: product name, brand, price, size, rating, and number of reviews.",
      "Print the results."]),

    ("barnesandnoble_com",
     "https://www.barnesandnoble.com",
     ["Search Barnes & Noble for bestselling books in \"fiction\".",
      "Extract the top 5 books: title, author, format (hardcover, paperback), price, and rating.",
      "Print the results."]),

    ("gamestop_com",
     "https://www.gamestop.com",
     ["Search GameStop for \"PlayStation 5\" games.",
      "Extract the top 5 games: title, platform, price, condition (new/pre-owned), and rating.",
      "Print the results."]),

    ("guitarcenter_com",
     "https://www.guitarcenter.com",
     ["Search Guitar Center for \"acoustic guitars\" under $500.",
      "Extract the top 5 guitars: model name, brand, price, body type, and rating.",
      "Print the results."]),

    ("containerstore_com",
     "https://www.containerstore.com",
     ["Search The Container Store for \"closet organization\" products.",
      "Extract the top 5 products: product name, price, dimensions, material, and rating.",
      "Print the results."]),

    ("westelm_com",
     "https://www.westelm.com",
     ["Search West Elm for \"mid-century modern sofas\".",
      "Extract the top 5 products: product name, price, dimensions, material, colors available, and rating.",
      "Print the results."]),

    ("cb2_com",
     "https://www.cb2.com",
     ["Search CB2 for \"dining tables\".",
      "Extract the top 5 products: product name, price, dimensions, material, and seating capacity.",
      "Print the results."]),

    # ===== Deals & Coupons (3) =====
    ("retailmenot_com",
     "https://www.retailmenot.com",
     ["Search RetailMeNot for coupon codes for \"Nike\".",
      "Extract the top 5 coupons: coupon description, discount amount/percentage, coupon code, expiration date, and success rate.",
      "Print the results."]),

    ("dealnews_com",
     "https://www.dealnews.com",
     ["Browse DealNews for the latest deals in \"electronics\".",
      "Extract the top 5 deals: product name, store, sale price, original price, and editor's rating.",
      "Print the results."]),

    ("offers_com",
     "https://www.offers.com",
     ["Search Offers.com for coupon codes for \"Amazon\".",
      "Extract the top 5 offers: offer description, discount type (% off, $ off, free shipping), code (if applicable), and expiration date.",
      "Print the results."]),

    # ===== How-to & Reference (4) =====
    ("wikihow_com",
     "https://www.wikihow.com",
     ["Search wikiHow for \"how to start a garden\".",
      "Extract: article title, number of parts/sections, number of steps, expert co-author (if any), views, and a summary of the first 3 steps.",
      "Print the information."]),

    ("howstuffworks_com",
     "https://www.howstuffworks.com",
     ["Search HowStuffWorks for articles about \"how solar panels work\".",
      "Extract the top 5 articles: title, author, category, and summary.",
      "Print the results."]),

    ("mentalfloss_com",
     "https://www.mentalfloss.com",
     ["Search Mental Floss for articles about \"fascinating facts\".",
      "Extract the top 5 articles: title, author, publish date, and summary.",
      "Print the results."]),

    ("lifehacker_com",
     "https://lifehacker.com",
     ["Search Lifehacker for articles about \"productivity tips\".",
      "Extract the top 5 articles: title, author, publish date, and summary.",
      "Print the results."]),

    # ===== Remaining Unique (3) =====
    ("babbel_com",
     "https://www.babbel.com",
     ["Browse Babbel's language course catalog.",
      "Extract the available languages with: language name, number of courses, estimated learning time, and beginner course description.",
      "Print the top 5 languages."]),

    ("coursera_org__degrees",
     "https://www.coursera.org/degrees",
     ["Browse Coursera's online degree programs in \"Computer Science\".",
      "Extract the top 5 degree programs: degree name, university, degree type (bachelor's/master's), tuition, and duration.",
      "Print the results."]),

    ("wholefoods_com__deals",
     "https://www.wholefoodsmarket.com/sales-flyer",
     ["Browse Whole Foods Market weekly deals.",
      "Extract the top 5 deals: product name, sale price, regular price, and discount/savings.",
      "Print the results."]),
]

def main():
    os.makedirs(VERBS_DIR, exist_ok=True)
    created = 0
    for folder_name, url, bullets in VERBS:
        folder_path = os.path.join(VERBS_DIR, folder_name)
        os.makedirs(folder_path, exist_ok=True)

        # Write prompt-create-trajectory.txt
        traj_path = os.path.join(folder_path, "prompt-create-trajectory.txt")
        with open(traj_path, "w", encoding="utf-8") as f:
            f.write(trajectory(url, bullets))

        # Write prompt-create-verb.txt
        verb_path = os.path.join(folder_path, "prompt-create-verb.txt")
        with open(verb_path, "w", encoding="utf-8") as f:
            f.write(PROMPT_VERB_CONTENT)

        created += 1

    print(f"Created {created} verb folders in {VERBS_DIR}")

if __name__ == "__main__":
    main()
