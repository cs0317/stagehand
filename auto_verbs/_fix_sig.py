sig = r'd:\repos\stagehand\auto_verbs\verbs\history_com\signature.txt'
with open(sig, 'r', encoding='utf-8') as f:
    s = f.read()
s = s.replace(
    '    author: str\n    publish_date: str\n    category: str',
    '    category: str\n    description: str\n    read_time: str'
)
s = s.replace(
    'with title, author, publish date, and category.',
    'with title, category, description, and read time.'
)
with open(sig, 'w', encoding='utf-8') as f:
    f.write(s)
print('Done')
sig = r'd:\repos\stagehand\auto_verbs\verbs\hackernoon_com\signature.txt'
with open(sig, 'r', encoding='utf-8') as f:
    s = f.read()
s = s.replace(
    '    publish_date: str\n    read_time: str\n    reactions: str',
    '    description: str'
)
s = s.replace(
    'with title, author, publish date, read time, and reactions.',
    'with title, author, and description.'
)
with open(sig, 'w', encoding='utf-8') as f:
    f.write(s)
print('Done')
sig = r'd:\repos\stagehand\auto_verbs\verbs\github_com__discussions\signature.txt'
with open(sig, 'r', encoding='utf-8') as f:
    s = f.read()
s = s.replace('    upvotes: str', '    posted_time: str')
s = s.replace('answer count, and upvotes.', 'posted time, and answer count.')
with open(sig, 'w', encoding='utf-8') as f:
    f.write(s)
print('Done')
sig = r'd:\repos\stagehand\auto_verbs\verbs\gg_deals_com\signature.txt'
with open(sig, 'r', encoding='utf-8') as f:
    s = f.read()
s = s.replace('    store: str\n', '')
s = s.replace('    current_price: str\n    historical_low: str\n    discount: str',
              '    original_price: str\n    current_price: str\n    discount: str')
s = s.replace('with title, store, current price, historical low, and discount.',
              'with title, original price, current price, and discount.')
with open(sig, 'w', encoding='utf-8') as f:
    f.write(s)
print('Done')
